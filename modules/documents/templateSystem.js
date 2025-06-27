/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { castToPrimitive, getGameCollection, getGameCollectionAsTemplateSystems, removeNull } from '../utils.js';
import { UncomputableError } from '../errors/UncomputableError.js';
import { isComputableElement } from '../interfaces/ComputableElement.js';
import { isAttributeBarElement } from '../interfaces/AttributeBarElement.js';
import SimpleComputableElement from './simpleImplementations/SimpleComputableElement.js';
import SimpleAttributeBarElement from './simpleImplementations/SimpleAttributeBarElement.js';
import { isChatSenderElement } from '../interfaces/ChatSenderElement.js';
import ComputablePhrase from '../formulas/ComputablePhrase.js';
import templateFunctions from '../sheets/template-functions.js';
import Panel from '../sheets/components/Panel.js';
import Logger from '../Logger.js';
import { applyModifiers } from '../interfaces/Modifier.js';
import CustomDialog from '../applications/custom-dialog.js';
/**
 * Agnostic template system used in Actors & Items
 */
class TemplateSystem {
    /**
     * @param entity The entity linked to this TemplateSystem
     */
    constructor(entity) {
        this.entity = entity;
        this._componentMap = {};
        this._modificationFlag = false;
    }
    /**
     * Is the entity a Template?
     */
    get isTemplate() {
        return this.entity.isTemplate;
    }
    /**
     * Is the entity an assignable Template?
     */
    get isAssignableTemplate() {
        return this.entity.isAssignableTemplate;
    }
    /**
     * Returns system value for the entity
     */
    get system() {
        return this.entity.system;
    }
    /**
     * Returns the entity uuid
     */
    get uuid() {
        return this.entity.uuid;
    }
    /**
     * Return the type of the entity
     */
    get entityType() {
        switch (this.entity.type) {
            case 'character':
            case '_template':
                return 'actor';
            case 'equippableItem':
            case '_equippableItemTemplate':
            case 'subTemplate':
            case 'userInputTemplate':
            case 'activeEffectContainer':
                return 'item';
        }
    }
    /**
     * Returns the entity's items
     */
    get items() {
        return this.entity.getItems();
    }
    /**
     * Returns component's types that are allowed in this entity
     */
    get allowedComponents() {
        let allowedComponents = componentFactory.componentTypes;
        switch (this.entity.type) {
            case 'userInputTemplate':
                allowedComponents = allowedComponents.filter((componentType) => !['dynamicTable', 'textArea'].includes(componentType));
                break;
            case '_equippableItemTemplate':
                allowedComponents = allowedComponents.filter((componentType) => !['conditionalModifierList'].includes(componentType));
                break;
            default:
                break;
        }
        return allowedComponents;
    }
    get isModified() {
        return this._modificationFlag;
    }
    set isModified(modificationFlag) {
        this._modificationFlag = modificationFlag;
        const sheetApplicationTitle = this.entity.sheet?.element.find('.window-title');
        if (sheetApplicationTitle) {
            const cache = sheetApplicationTitle.children();
            sheetApplicationTitle.text(this.entity.sheet.title).append(cache);
        }
    }
    /**
     * Gets the component map
     */
    get componentMap() {
        return this._componentMap;
    }
    /**
     * Renders the entity
     * @param force Render if not opened?
     * @param context Rendering context
     */
    render(force, context) {
        this.entity.render(force, context);
    }
    /**
     * Prepares entity data
     */
    prepareData() {
        // If template version changed, we need to recompute the components hierarchy
        if (this._templateSystemUniqueVersion !== this.system.templateSystemUniqueVersion) {
            this._templateSystemUniqueVersion = this.system.templateSystemUniqueVersion;
            this.customHeader = undefined;
            this.customBody = undefined;
        }
        if (!this.customHeader) {
            this.customHeader = Panel.fromJSON((this.system.header ?? {}), 'header');
        }
        if (!this.customBody) {
            this.customBody = Panel.fromJSON(this.system.body, 'body');
        }
        this._componentMap = this._getComponentMap();
        this._prepareEntityData();
    }
    /**
     * Prepare Entity type specific data
     */
    _prepareEntityData() {
        /**
         * @deprecated
         */
        let triggeredModifierWarning = false;
        if (this.isTemplate)
            return;
        // Make modifications to system here.
        const system = this.system;
        system.props.name = this.entity.name;
        system.props.uuid = this.uuid;
        system.props.id = this.entity.id;
        system.props.img = this.entity.img;
        // const items = this.items;
        const modifierPropsByKey = {};
        const allModifiers = this.getModifiers();
        for (const modifier of allModifiers) {
            this._computeModifierValues(modifier, modifier.originalEntity, modifierPropsByKey);
        }
        const activeEffectsByKey = this.getSortedActiveEffects(system);
        // Computing all properties
        const computableComponents = Object.keys(this.componentMap)
            .filter((key) => isComputableElement(this.componentMap[key]))
            .reduce((res, key) => ((res[key] = this.componentMap[key]), res), {});
        const attributeBars = {
            ...Object.keys(system.attributeBar ?? {}).reduce((res, key) => ((res[key] = new SimpleAttributeBarElement(key, system.attributeBar[key].value ?? '', system.attributeBar[key].max, system.attributeBar[key].editable)),
                res), {}),
            ...Object.keys(this.componentMap)
                .filter((key) => isAttributeBarElement(this.componentMap[key]))
                .reduce((res, key) => ((res[key] = this.componentMap[key]), res), {})
        };
        for (const hidden of system.hidden ?? []) {
            computableComponents[hidden.name] = new SimpleComputableElement(hidden.name, hidden.value);
        }
        let computeFormulas = {};
        for (const component in computableComponents) {
            const computeFunctions = computableComponents[component].getComputeFunctions(this, modifierPropsByKey);
            foundry.utils.mergeObject(system.props, computableComponents[component].resetComputeValue(Object.keys(computeFunctions), this));
            computeFormulas = {
                ...computeFormulas,
                ...computeFunctions
            };
        }
        system.props = removeNull(system.props);
        let computedProps;
        const uncomputedProps = { ...computeFormulas };
        let nLoops = 0;
        // Loop while all props are not computed
        // Some computed properties are used in other computed properties, so we need to make several passes to compute them all
        do {
            nLoops++;
            computedProps = {};
            const baseFormulaProps = foundry.utils.mergeObject(system.props, computedProps, {
                inplace: false
            });
            // For each uncomputed property, we try to compute it
            for (const prop in uncomputedProps) {
                try {
                    const computeValue = uncomputedProps[prop];
                    let newComputedValue;
                    if (typeof computeValue === 'function') {
                        newComputedValue = computeValue(computedProps);
                    }
                    else {
                        const { formula, options } = computeValue;
                        let formulaProps = baseFormulaProps;
                        if (options?.customProps) {
                            formulaProps = foundry.utils.mergeObject(baseFormulaProps, options.customProps, {
                                inplace: false
                            });
                        }
                        newComputedValue = ComputablePhrase.computeMessageStatic(formula, formulaProps, {
                            ...options,
                            source: prop,
                            availableKeys: Object.keys(formulaProps),
                            triggerEntity: this
                        }).result;
                        if (modifierPropsByKey[prop]) {
                            if (!triggeredModifierWarning) {
                                Logger.warn(game.i18n.localize('CSB.Modifier.EditDialog.DeprecationWarning'));
                                triggeredModifierWarning = true;
                            }
                            newComputedValue = applyModifiers(newComputedValue, modifierPropsByKey[prop]);
                        }
                        foundry.utils.setProperty(system.props, prop, castToPrimitive(newComputedValue));
                        if (activeEffectsByKey[prop]) {
                            activeEffectsByKey[prop].forEach(({ activeEffect, change }) => {
                                if (!activeEffect.active)
                                    return;
                                const override = activeEffect.apply(this.entity, change, true);
                                if (Object.values(override)[0]) {
                                    newComputedValue = Object.values(override)[0];
                                }
                            });
                        }
                    }
                    // If successful, the property is added to computedProp and deleted from uncomputedProps
                    foundry.utils.setProperty(system.props, prop, castToPrimitive(newComputedValue));
                    foundry.utils.setProperty(computedProps, prop, castToPrimitive(newComputedValue));
                    Logger.debug(`Computed ${prop} successfully !`, newComputedValue);
                    delete uncomputedProps[prop];
                }
                catch (err) {
                    if (err instanceof UncomputableError) {
                        Logger.debug(`Passing prop ${prop} to next round of computation...`);
                        foundry.utils.setProperty(system.props, prop, undefined);
                    }
                    else {
                        throw err;
                    }
                }
            }
            Logger.debug('Computed props for ' +
                this.entity.name +
                ' - ' +
                Object.keys(computedProps).length +
                ' / ' +
                Object.keys(uncomputedProps).length, {
                computedProps: computedProps,
                leftToCompute: uncomputedProps
            });
        } while (
        // If no uncomputed props are left, we computed everything, and we can stop
        // If computedProps is empty, that means nothing was computed in this loop, and there is an error in the property definitions
        // Probably a wrongly defined formula, or a loop in property definition
        Object.keys(uncomputedProps).length > 0 &&
            Object.keys(computedProps).length > 0);
        // We log the remaining uncomputable properties for debug
        if (Object.keys(uncomputedProps).length > 0) {
            Logger.warn('Some props were not computed.', { uncomputedProps, scope: system.props });
        }
        Logger.info(`All props for ${this.entity.name} (${this.entity.id}) computed in ${nLoops} loops.`);
        if (!system.attributeBar) {
            system.attributeBar = {};
        }
        for (const prop in attributeBars) {
            const max = attributeBars[prop].getMaxValue(this);
            const value = attributeBars[prop].getValue(this);
            const editable = attributeBars[prop].isEditable();
            foundry.utils.setProperty(system.attributeBar, prop, {
                value: value,
                max: max,
                key: prop,
                editable: editable
            });
        }
    }
    /**
     * Computes modifier values
     * @param modifier The modifier to compute
     * @param triggeringEntity Current entity
     * @param result The result
     */
    _computeModifierValues(modifier, triggeringEntity, result) {
        try {
            if (modifier) {
                const modifierKeys = ComputablePhrase.computeMessageStatic(modifier.key, triggeringEntity.system.props, {
                    source: `modifier.${modifier.key}.key`,
                    defaultValue: 0,
                    triggerEntity: triggeringEntity
                }).result.split(',');
                modifier.value = ComputablePhrase.computeMessageStatic(modifier.formula, triggeringEntity.system.props, {
                    source: `modifier.${modifier.value}.value`,
                    defaultValue: 0,
                    triggerEntity: triggeringEntity
                }).result;
                modifier.isSelected =
                    !modifier.conditionalGroup ||
                        this.system.activeConditionalModifierGroups.includes(modifier.conditionalGroup);
                modifierKeys.forEach((key) => result[key] ? result[key].push({ ...modifier, key }) : (result[key] = [{ ...modifier, key }]));
            }
        }
        catch (err) {
            Logger.warn('There was an error computing a modifier', err);
        }
    }
    /**
     * Can the current entity own the new Item ?
     * @param newItem The new CustomItem to add
     * @return Boolean indicating if the Item is ownable
     */
    canOwnItem(newItem) {
        if (this.isTemplate) {
            return false;
        }
        if (newItem.type !== 'equippableItem') {
            return false;
        }
        if (newItem.system.unique) {
            return !this.items.some((item) => item.system.uniqueId === newItem.system.uniqueId);
        }
        return true;
    }
    /**
     * Get data useful for sheets only
     * @param context The entity sheet data
     * @return The updated entity sheet data
     */
    async getSheetData(context) {
        const availableTemplates = getGameCollectionAsTemplateSystems(this.entityType)
            .filter((entity) => entity.isAssignableTemplate)
            .map((entity) => entity.entity);
        let entityContext;
        switch (this.entityType) {
            case 'actor':
                entityContext = context.actor;
                break;
            case 'item':
                entityContext = context.item;
                break;
            default:
                throw new Error(`Unknown entity type ${this.entityType}`);
        }
        const system = entityContext.system;
        // Add the entity's data to context.system for easier access, as well as flags.
        const extendedContext = {
            ...context,
            system: system,
            flags: entityContext.flags,
            rollData: this.getRollData(),
            availableTemplates,
            isGM: game.user.isGM,
            canReload: game.user.hasRole(game.settings.get(game.system.id, 'minimumRoleTemplateReloading')),
            display: system.display,
            template: system.template,
            manualEntitySaving: !!game.settings.get(game.system.id, 'manualEntitySaving')
        };
        if (this.customHeader) {
            extendedContext.headerPanel = await this.customHeader.render(this, this.entity.sheet.isEditable);
        }
        if (this.customBody) {
            extendedContext.bodyPanel = await this.customBody.render(this, this.entity.sheet.isEditable);
        }
        return extendedContext;
    }
    /**
     * @ignore
     * @override
     */
    getRollData(baseEntityData) {
        if (this.isTemplate)
            return {};
        // Prepare character roll data.
        const rollData = foundry.utils.deepClone(baseEntityData) ?? {};
        if (rollData.props) {
            for (const [k, v] of Object.entries(rollData.props)) {
                rollData[k] = foundry.utils.deepClone(v);
            }
        }
        delete rollData.body;
        delete rollData.header;
        delete rollData.hidden;
        delete rollData.display;
        delete rollData.template;
        rollData.name = this.entity.name;
        return rollData;
    }
    /**
     * Rolls a template's defined roll with this Character properties
     * @param rollKey The key of the Component holding the roll
     * @param options Roll options
     * @returns The computed roll
     * @throws {Error} If the key does not have a roll
     */
    async roll(rollKey, options = {}) {
        const { postMessage = true, alternative = false } = options;
        const error = new Error(`Label Roll Message with the key "${rollKey}" not found in Entity`);
        const refRoll = rollKey.split('.');
        const [filterMatch, parentProp, filterProp, filterValue] = refRoll.shift()?.match(/^([a-zA-Z0-9_]+)\((@?[a-zA-Z0-9_]+)=(.+)\)$/) ?? [];
        let item, reference = rollKey;
        if (filterMatch) {
            const parent = foundry.utils.getProperty(this.entity.getRollData(), parentProp);
            if (!parent) {
                throw error;
            }
            let index;
            if (filterProp === '@rowId') {
                index = filterValue;
                item = this.entity.items.get(index);
            }
            else {
                index = Object.keys(parent).filter((key) => parent[key][filterProp] === filterValue)[0];
            }
            if (!index) {
                throw error;
            }
            rollKey = `${parentProp}.${index}.${refRoll.join('.')}`;
            reference = `${parentProp}.${index}`;
        }
        const rollType = alternative ? 'alternative' : 'main';
        const renderOptions = {
            reference: reference,
            source: `TemplateSystem#roll('${rollKey}', '${rollType}')`
        };
        if (item) {
            renderOptions.linkedEntity = item;
            renderOptions.customProps = {
                item: { ...item.system.props, name: item.name }
            };
        }
        // Recovering value from data
        const chatSenderFunction = this.getCustomRoll(`${rollKey}.${rollType}`, renderOptions);
        if (!chatSenderFunction || typeof chatSenderFunction !== 'function') {
            throw error;
        }
        return chatSenderFunction(postMessage);
    }
    /**
     * Gets all custom rolls defined in the character's template
     * @returns All the functions triggering the rolls, in an object organizing them by keys
     */
    getCustomRoll(rollKey, options) {
        const splitRollKey = rollKey.split('.');
        const rollComponent = this.componentMap[splitRollKey[0]];
        if (!isChatSenderElement(rollComponent)) {
            return undefined;
        }
        const allRolls = rollComponent.getSendToChatFunctions(this, options);
        if (!allRolls) {
            return undefined;
        }
        const chatSenderFunction = foundry.utils.getProperty(allRolls, `${rollKey}`);
        return chatSenderFunction;
    }
    /**
     * Go through the template to get every keyed component in a flat object
     * @returns A flat map of keyed components
     */
    _getComponentMap() {
        const componentMap = {};
        for (const rootComponent of [this.customHeader, this.customBody]) {
            if (rootComponent) {
                foundry.utils.mergeObject(componentMap, rootComponent.getComponentMap());
            }
        }
        return componentMap;
    }
    /**
     * Gets all keys in template, in a set
     * @return The set of keys
     */
    getKeys() {
        const keys = new Set(Object.keys(this.componentMap));
        // Adding special key 'name', used by the field on top of the sheets.
        keys.add('name');
        keys.delete('');
        return keys;
    }
    /**
     * Gets all properties and default values used in properties in template, in an object
     * @return The object containing all keys and default values
     */
    getAllProperties() {
        const properties = {
            ...Object.fromEntries(this.system.hidden?.map((elt) => [elt.name, undefined])),
            ...this.customHeader?.getAllProperties(this),
            ...this.customBody?.getAllProperties(this)
        };
        // Adding special key 'name', used by the field on top of the sheets.
        properties.name = undefined;
        delete properties[''];
        return properties;
    }
    /**
     * Gets all modifiers, from items and status effects
     *
     * @returns All modifiers
     */
    getModifiers() {
        let modifiers = [];
        for (const item of this.items) {
            const itemTemplate = game.items.get(item.system.template);
            if (!itemTemplate) {
                const warnMsg = game.i18n.format('CSB.UserMessages.ItemTemplateDeleted', {
                    ITEM_NAME: item.name,
                    ITEM_UUID: item.uuid,
                    ENTITY_NAME: this.entity.name ?? '',
                    ENTITY_UUID: this.uuid
                });
                Logger.warn(warnMsg);
                ui.notifications.warn(warnMsg);
            }
            modifiers = modifiers.concat(itemTemplate?.system.modifiers?.map((modifier) => ({
                ...modifier,
                originalEntity: item.templateSystem
            })) ?? [], item.system.modifiers?.map((modifier) => ({
                ...modifier,
                originalEntity: item.templateSystem
            })) ?? []);
        }
        // Getting effect modifiers
        if (this.entity.statuses) {
            for (const statusId of this.entity.statuses) {
                modifiers = modifiers.concat(this.system.statusEffects[statusId]?.map((modifier) => ({ ...modifier, originalEntity: this })) ??
                    []);
            }
        }
        return modifiers.filter((mod) => mod !== undefined);
    }
    /**
     * Gets all conditional modifier group names, from items and status effects
     *
     * @returns All conditional modifier, grouped by group names
     */
    getSortedConditionalModifiers() {
        const modifiers = this.getModifiers();
        const allGroups = {};
        modifiers.map((modifier) => {
            if (modifier.conditionalGroup) {
                if (!allGroups[modifier.conditionalGroup]) {
                    allGroups[modifier.conditionalGroup] = [modifier];
                }
                else {
                    allGroups[modifier.conditionalGroup].push(modifier);
                }
            }
        });
        return allGroups;
    }
    getSortedActiveEffects(system, includeDisabled = false) {
        const activeEffectsByKey = {};
        // Organize non-disabled effects by their application priority
        for (const effect of this.entity.allApplicableEffects({ excludeExternal: false, excludeTransfer: true })) {
            if (!includeDisabled && !effect.active)
                continue;
            effect.changes.forEach((change) => {
                try {
                    const props = {
                        ...effect.parent.system.props,
                        target: system.props
                    };
                    const effectKeys = ComputablePhrase.computeMessageStatic(change.key, props, {
                        source: `activeEffect.${effect.name}.key`,
                        triggerEntity: effect.parent.templateSystem
                    }).result.split(',');
                    effectKeys.forEach((key) => {
                        const c = foundry.utils.deepClone(change);
                        c.key = key.startsWith('system.props.') ? key.substring(13) : key;
                        //@ts-expect-error Outdated types
                        c.effect = effect;
                        c.priority = c.priority ?? c.mode * 10;
                        const sortingKey = c.key.startsWith('target.') ? c.key.substring(7) : c.key;
                        if (!activeEffectsByKey[sortingKey]) {
                            activeEffectsByKey[sortingKey] = [];
                        }
                        activeEffectsByKey[sortingKey].push({ activeEffect: effect, change: c });
                    });
                }
                catch (err) {
                    Logger.error(`Error when computing active effet key ${effect.name} - ${change.key} for actor ${this.entity.name}`, err);
                }
            });
        }
        for (const key in activeEffectsByKey) {
            activeEffectsByKey[key].sort((a, b) => (a.change.priority ?? 0) - (b.change.priority ?? 0));
        }
        return activeEffectsByKey;
    }
    /**
     * Reloads this entity's templates, updating the component structure, and re-renders the sheet.
     * @param templateId New template id. If not set, will reload the current template.
     */
    async reloadTemplate(templateId) {
        const entityCollection = getGameCollection(this.entityType);
        templateId = templateId || this.system.template;
        if (!templateId) {
            throw new Error(`Trying to reload entity without template: ${this.entity.uuid} - ${this.entity.name}`);
        }
        const template = entityCollection.get(templateId);
        if (!template) {
            throw new Error(`Trying to reload entity with undefined template: ${templateId} - ${this.entity.uuid} - ${this.entity.name}`);
        }
        if (template.system.attributeBar) {
            for (const barName in this.system.attributeBar) {
                if (!template.system.attributeBar[barName]) {
                    template.system.attributeBar['-=' + barName] = { max: 0, editable: false, key: barName };
                }
            }
        }
        const allProperties = template.templateSystem.getAllProperties();
        const availableKeys = new Set(Object.keys(allProperties));
        for (const prop in this.system.props) {
            if (!availableKeys.has(prop)) {
                this.system.props['-=' + prop] = true;
            }
        }
        for (const prop in allProperties) {
            if (this.system.props[prop] === undefined && allProperties[prop] !== null) {
                this.system.props[prop] = allProperties[prop];
            }
        }
        this.entity.sheet._hasBeenRenderedOnce = false;
        // Updates hidden properties, tabs & header data
        // Sheet rendering will handle the actual props creation
        await this.entity.update({
            system: {
                templateSystemUniqueVersion: template.system.templateSystemUniqueVersion,
                template: templateId,
                hidden: template.system.hidden,
                body: template.system.body,
                header: template.system.header,
                display: template.system.display,
                attributeBar: template.system.attributeBar,
                statusEffects: template.system.statusEffects,
                props: this.system.props
            }
        });
        const effectsToCreate = [];
        const effectsToUpdate = [];
        const effectsToDelete = [];
        template.effects.forEach((effect) => {
            const existingEffect = this.entity.effects.find((existingEffect) => {
                return existingEffect.getFlag(game.system.id, 'originalUuid') === effect.uuid;
            });
            if (existingEffect) {
                effectsToUpdate.push({ ...effect.toJSON(), _id: existingEffect.id });
            }
            else {
                effectsToCreate.push(effect.toJSON());
            }
        });
        this.entity.effects.forEach((existingEffect) => {
            if (existingEffect.getFlag(game.system.id, 'isFromTemplate') &&
                existingEffect.getFlag(game.system.id, 'originalParentId') !== template.id) {
                effectsToDelete.push(existingEffect.id);
            }
            if (existingEffect.getFlag(game.system.id, 'originalParentId') === template.id) {
                if (!template.effects.has(existingEffect.getFlag(game.system.id, 'originalId'))) {
                    effectsToDelete.push(existingEffect.id);
                }
            }
        });
        await Promise.allSettled([
            this.entity.updateEmbeddedDocuments('ActiveEffect', effectsToUpdate),
            this.entity.createEmbeddedDocuments('ActiveEffect', effectsToCreate),
            this.entity.deleteEmbeddedDocuments('ActiveEffect', effectsToDelete)
        ]);
        Logger.debug('Updated !');
        this.entity.render(false);
    }
    /**
     * Saves template data, updates templateSystemUniqueVersion and handles history generation
     */
    async saveTemplate() {
        const history = this.addSnapshotHistory();
        await this.entity.update({
            system: {
                header: this.customHeader?.toJSON(),
                body: this.customBody?.toJSON(),
                templateSystemUniqueVersion: (Math.random() * 0x100000000) >>> 0
            },
            flags: {
                [game.system.id]: {
                    templateHistory: history,
                    templateHistoryRedo: []
                }
            }
        });
        this.entity.render(false);
    }
    /**
     * Throws an UncomputableError. This can be used in custom-scripts of Users, where the Script depends on computable
     * properties, which are potentially undefined in the current computation cycle.
     *
     * @param message The error message, which will be displayed in the console, if the computation fails after multiple attempts
     * @param source The source of the error. This should be a path of where the error happened (e.g. dynamicTableKey.columnKey). This will only be used for debugging
     */
    throwUncomputableError(message, source = '') {
        throw new UncomputableError(message, source, '(Script-Expression)', this.system.props);
    }
    /**
     * Adds a new snapshot to the history, computing it if necessary
     * @param diff The diff to add, if already computed
     * @returns The full history
     */
    addSnapshotHistory(diff) {
        if (!diff) {
            diff = DeepDiff.diff({
                header: this.system.header,
                body: this.system.body
            }, {
                header: this.customHeader?.toJSON(),
                body: this.customBody?.toJSON()
            });
        }
        let history = this._getHistory();
        history.push(diff);
        history = history.slice(-10);
        return history;
    }
    /**
     * Adds a new snapshot to the redo-history
     * @param diff The diff to add
     * @returns The full redo-history
     */
    addSnapshotHistoryRedo(diff) {
        let redoHistory = this._getHistoryRedo();
        redoHistory.push(diff);
        redoHistory = redoHistory.slice(-10);
        return redoHistory;
    }
    /**
     * Undoes the latest diff in history
     */
    async undoHistory() {
        const history = this._getHistory();
        const diff = history.pop();
        if (diff) {
            const redoHistory = this.addSnapshotHistoryRedo(diff);
            const state = {
                header: this.system.header,
                body: this.system.body
            };
            for (const aDiff of diff) {
                DeepDiff.revertChange(state, {}, aDiff);
            }
            await this.entity.update({
                flags: {
                    [game.system.id]: {
                        templateHistory: history,
                        templateHistoryRedo: redoHistory
                    }
                },
                system: {
                    header: state.header,
                    body: state.body,
                    templateSystemUniqueVersion: (Math.random() * 0x100000000) >>> 0
                }
            });
            this.entity.render(false);
        }
    }
    /**
     * Redoes the latest diff in redo-history
     */
    async redoHistory() {
        const redoHistory = this._getHistoryRedo();
        const diff = redoHistory.pop();
        if (diff) {
            const history = this.addSnapshotHistory(diff);
            const state = {
                header: this.system.header,
                body: this.system.body
            };
            for (const aDiff of diff) {
                DeepDiff.applyChange(state, {}, aDiff);
            }
            await this.entity.update({
                flags: {
                    [game.system.id]: {
                        templateHistory: history,
                        templateHistoryRedo: redoHistory
                    }
                },
                system: {
                    header: state.header,
                    body: state.body,
                    templateSystemUniqueVersion: (Math.random() * 0x100000000) >>> 0
                }
            });
            this.entity.render(false);
        }
    }
    /**
     * @returns The template's history
     */
    _getHistory() {
        return this.entity.getFlag(game.system.id, 'templateHistory') ?? [];
    }
    /**
     * @returns The template's redo-history
     */
    _getHistoryRedo() {
        return this.entity.getFlag(game.system.id, 'templateHistoryRedo') ?? [];
    }
    /**
     * Sets the saving timeout in case of delayed save
     * @alpha Delayed saving is not fully functional at the moment
     */
    /*     setSaveTimeout(...args: Array<never>) {
        if (
            document.activeElement &&
            ($(document.activeElement).parents(`#${this.entity.sheet!.id}`).length === 0 ||
                ['checkbox', 'radio'].includes($(document.activeElement).prop('type')) ||
                ['select'].includes($(document.activeElement).prop('tagName').toLowerCase()))
        ) {
            return (
                this.entity.sheet! as unknown as
                    | CustomActorSheet
                    | EquippableItemSheet
                    | SubTemplateItemSheet
                    | UserInputTemplateItemSheet
            )?.forceSubmit(...(args as unknown as [Event, FormApplication.OnSubmitOptions]));
        } else {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                this.setSaveTimeout(...args);
            }, 500);
        }
    }
 */
    /**
     * Handles the sheet submit to either save now or wait a delay if activated in system settings
     */
    async handleSheetSubmit() {
        this.isModified = true;
        if (this.entity.sheet) {
            this.entity.apps[this.entity.sheet.appId].options.title += '*';
        }
    }
    async forceSubmitSheet() {
        this.isModified = false;
        return this.entity.sheet?.submit();
    }
    async configureAttributes() {
        // Open the dialog for edition
        return templateFunctions.attributes((newAttributes) => {
            // Update the entity with new hidden attributes
            this.entity
                .update({
                system: {
                    hidden: newAttributes
                }
            })
                .then(() => {
                this.entity.render(false);
            });
        }, this.system.hidden);
    }
    async editAttributeBars() {
        // Open the dialog for edition
        return templateFunctions.attributeBars((newAttributeBars) => {
            // This is called on dialog validation
            for (const barName in this.system.attributeBar) {
                if (!newAttributeBars[barName]) {
                    newAttributeBars['-=' + barName] = { max: '0', editable: false };
                }
            }
            // Update the entity with new hidden attributes
            this.entity
                .update({
                system: {
                    attributeBar: newAttributeBars
                }
            })
                .then(() => {
                this.entity.render(false);
            });
        }, this.system.attributeBar);
    }
    async editDisplaySettings() {
        // Open the dialog for edition
        return templateFunctions.displaySettings((displaySettings) => {
            // This is called on dialog validation
            // Update the entity with new hidden attributes
            this.entity
                .update({
                system: {
                    display: displaySettings
                }
            })
                .then(() => {
                this.entity.render(false);
            });
        }, this.system.display);
    }
    // Edit status effects actions
    async editStatusEffects() {
        const allEffects = CONFIG.statusEffects.map((anEffect) => {
            const newEffect = {
                ...anEffect,
                modifiers: [],
                label: '',
                visible: false,
                editable: true
            };
            newEffect.modifiers = this.system.statusEffects[anEffect.id] ?? [];
            newEffect.label = game.i18n.localize(anEffect.name);
            return newEffect;
        });
        // Open the dialog for edition
        return templateFunctions.modifiers((statusEffects) => {
            // This is called on dialog validation
            // Update the entity with new status effects modifiers
            this.entity
                .update({
                system: {
                    statusEffects: statusEffects
                }
            })
                .then(() => {
                this.entity.render(false);
            });
        }, allEffects);
    }
    async reloadAllSheets() {
        return templateFunctions.reloadTemplates((includeActorsInGameDirectory, sceneSelection) => {
            const entities = [].concat((sceneSelection === 'all'
                ? Array.from(game.scenes).flatMap((scene) => Array.from(scene.tokens))
                : sceneSelection === 'current'
                    ? game.scenes.get(game.user?.viewedScene ?? '')?.tokens ?? []
                    : [])
                .filter((token) => !token.actorLink && token.actor)
                .map((token) => token.actor.templateSystem), includeActorsInGameDirectory
                ? game
                    .actors.filter((actor) => !actor.isTemplate)
                    .map((actor) => actor.templateSystem)
                : []);
            const filteredCollection = this.entityType === 'item'
                ? entities.flatMap((entity) => Array.from(entity.items))
                    .filter((item) => item.system.template === this.entity.id)
                    .map((item) => item.templateSystem)
                : entities;
            this.reloadTemplatesOfEntities(getGameCollectionAsTemplateSystems(this.entityType)
                .filter((entity) => entity.system.template === this.entity.id)
                .concat(filteredCollection));
        }, {
            documentType: this.entityType
        });
    }
    async reloadSheetTemplate(ev) {
        if (game.user?.hasRole(game.settings.get(game.system.id, 'minimumRoleTemplateReloading'))) {
            const target = $(ev.currentTarget);
            const templateId = target
                .parents('.custom-system-template-select')
                .find(`#template-${this.entity.id}`)
                .val();
            return this.reloadTemplate(String(templateId));
        }
    }
    openTemplate(ev) {
        const target = $(ev.currentTarget);
        const templateId = target.parents('.custom-system-template-select').find(`#template-${this.entity.id}`).val();
        if (templateId) {
            getGameCollection(this.entityType).get(String(templateId))?.sheet?.render(true);
        }
    }
    async configureModifiers() {
        const allModifierBlocks = [];
        if (this.entity.sheet?.isEditable) {
            if (!this.entity.isTemplate) {
                const entityCollection = getGameCollection(this.entityType);
                const templateId = this.system.template ?? '';
                const template = entityCollection.get(templateId);
                if (!template) {
                    throw new Error(`Trying to edit modifiers without template : ${this.entity.uuid} - ${this.entity.name}`);
                }
                allModifierBlocks.push({
                    modifiers: template.system.modifiers,
                    id: 'tpl_mod',
                    label: game.i18n.localize('CSB.Modifier.TemplateModifiers'),
                    visible: true,
                    editable: false
                });
            }
            allModifierBlocks.push({
                modifiers: this.system.modifiers,
                id: 'item_mod',
                label: game.i18n.localize('CSB.Modifier.ItemModifiers'),
                visible: true,
                editable: true
            });
            return templateFunctions.modifiers((newModifiers) => {
                // Update the entity with new hidden attributes
                this.entity
                    .update({
                    system: {
                        modifiers: newModifiers.item_mod
                    }
                })
                    .then(() => {
                    this.entity.render(false);
                });
            }, allModifierBlocks);
        }
    }
    async reloadTemplatesOfEntities(entities) {
        let counter = 1;
        return Promise.all(entities.map((entity) => entity.reloadTemplate().then(() => this.logReloadProgress(entity, counter++, entities.length)))).then(() => this.finishReloadProgress(entities.length));
    }
    logReloadProgress(entity, current, max) {
        Logger.log(`Reloaded ${entity.entity.name} (${entity.uuid}): ${current} / ${max}`);
        SceneNavigation.displayProgressBar({
            label: game.i18n.format('CSB.ProgressBar.ReloadingTemplates', {
                NAME: entity.entity.name,
                UUID: entity.uuid,
                CURRENT: current,
                MAX: max
            }),
            pct: Math.round((current * 100) / max)
        });
    }
    finishReloadProgress(max) {
        Logger.log(`Reloading Templates of Documents finished (reloaded ${max} documents)`);
        SceneNavigation.displayProgressBar({
            label: game.i18n.format('CSB.ProgressBar.ReloadingTemplatesFinished', { MAX: max }),
            pct: 100
        });
    }
    /**
     * Activate listeners on the sheets
     *
     * @param html The sheet HTML to activate the listeners
     */
    activateListeners(html) {
        // -------------------------------------------------------------
        // Everything below here is only needed if the sheet is editable
        if (!this.entity.sheet?.isEditable)
            return;
        if (this.isTemplate) {
            // Undo button
            html.find('.custom-system-undo').on('click', async (_ev) => this.undoHistory());
            if (this._getHistory().length === 0) {
                html.find('.custom-system-undo').prop('disabled', 'disabled');
            }
            // Redo button
            html.find('.custom-system-redo').on('click', async (_ev) => this.redoHistory());
            if (this._getHistoryRedo().length === 0) {
                html.find('.custom-system-redo').prop('disabled', 'disabled');
            }
            // Edit hidden attributes
            html.find('.custom-system-configure-attributes').on('click', async (_ev) => this.configureAttributes());
            // Edit attribute bars
            html.find('.custom-system-configure-attribute-bars').on('click', async (_ev) => this.editAttributeBars());
            // Edit display settings
            html.find('.custom-system-configure-display').on('click', async (_ev) => this.editDisplaySettings());
            // Edit active effects actions
            html.find('.custom-system-configure-status-effects').on('click', async (_ev) => this.editStatusEffects());
            // Reload all sheets
            html.find('.custom-system-reload-all-sheets').on('click', (_ev) => this.reloadAllSheets());
            html.on('dragenter', () => {
                html.find('.custom-system-droppable-container').addClass('custom-system-template-dragged-eligible');
                html.find('.custom-system-component-root').addClass('custom-system-template-dragged-eligible');
            });
            $(document).on('dragend', () => {
                $('.custom-system-template-dragged-eligible').removeClass('custom-system-template-dragged-eligible custom-system-template-dragged-over');
            });
        }
        else {
            html.find('.custom-system-template-select .custom-system-reload-template').on('click', async (ev) => this.reloadSheetTemplate(ev));
            html.find('.custom-system-template-select .custom-system-open-template').on('click', async (ev) => this.openTemplate(ev));
            // See hidden attributes values
            html.find('.custom-system-see-attributes').on('click', async (_ev) => this.openAttributesVision());
            // See hidden attribute-bars values
            html.find('.custom-system-see-attribute-bars').on('click', async (_ev) => this.openAttributeBarsVision());
            html.find('.custom-system-save-entity').on('click', async (_ev) => this.forceSubmitSheet());
        }
        html.find('.custom-system-configure-modifiers').on('click', async (_ev) => this.configureModifiers());
    }
    async openAttributesVision() {
        const attributes = [];
        for (const hiddenAttr of this.system.hidden) {
            attributes.push({
                name: hiddenAttr.name,
                value: this.system.props[hiddenAttr.name]
            });
        }
        const content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/readAttributes.hbs`, {
            attributes
        });
        new CustomDialog({
            title: game.i18n.localize('CSB.Attributes.HiddenAttributesDialog.Title'),
            content,
            buttons: {
                ok: {
                    label: game.i18n.localize('Close')
                }
            }
        }).render(true);
    }
    async openAttributeBarsVision() {
        const attributeBars = Object.values(this.system.attributeBar);
        const content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/readAttributeBars.hbs`, {
            attributeBars
        });
        new CustomDialog({
            title: game.i18n.localize('CSB.Attributes.AttributeBarsDialog.Title'),
            content,
            buttons: {
                ok: {
                    label: game.i18n.localize('Close')
                }
            }
        }).render(true);
    }
}
export default TemplateSystem;
globalThis.TemplateSystem = TemplateSystem;
