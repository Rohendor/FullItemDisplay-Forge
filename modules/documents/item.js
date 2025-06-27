/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import TemplateSystem from './templateSystem.js';
import ActiveEffectContainer from '../sheets/components/ActiveEffectContainer.js';
import { TABLE_SORT_OPTION } from '../sheets/components/ExtensibleTable.js';
export class CustomItem extends Item {
    static getEmbeddedItemsFolder(warnIfNotFound = true) {
        const folder = game.items.folders.getName(this.EMBEDDED_ITEMS_FOLDER_NAME);
        if (!folder && warnIfNotFound) {
            ui.notifications.warn(game.i18n.format('CSB.UserMessages.EmbeddedItemsFolderNotFound', {
                EMBEDDED_ITEMS_FOLDER_NAME: this.EMBEDDED_ITEMS_FOLDER_NAME
            }));
        }
        return folder;
    }
    static async createDialog(data, options) {
        //@ts-expect-error Outdated types
        options.types = this.TYPES.filter((type) => type !== CONST.BASE_DOCUMENT_TYPE && type !== 'activeEffectContainer');
        super.createDialog(data, options);
    }
    constructor(data, context) {
        if (data?.flags?.['dfreds-convenient-effects']) {
            data.type = 'activeEffectContainer';
        }
        if (data?.type === 'activeEffectContainer') {
            if (!data.flags?.['dfreds-convenient-effects']) {
                if (!data.flags) {
                    data.flags = {};
                }
                data.flags['dfreds-convenient-effects'] = {
                    folderColor: '',
                    isBackup: false,
                    isConvenient: true,
                    isViewable: true
                };
            }
            if (!data.system) {
                data.system = {
                    activeConditionalModifierGroups: [],
                    attributeBar: {},
                    body: {},
                    display: {},
                    header: {},
                    hidden: [],
                    props: {},
                    statusEffects: {}
                };
            }
            if (!data.system.body) {
                data.system.body = {};
            }
            data.system.props = {};
            data.system.body.contents = [
                new ActiveEffectContainer({
                    key: 'activeEffects',
                    head: true,
                    deleteWarning: true,
                    headDisplay: true,
                    showDelete: true,
                    staticRowLayout: {
                        active: {
                            enabled: false,
                            colName: 'Active',
                            align: 'left',
                            sort: 1
                        },
                        name: {
                            enabled: true,
                            colName: 'Name',
                            align: 'center',
                            sort: 2
                        },
                        origin: {
                            enabled: false,
                            colName: 'Origin',
                            align: 'center',
                            sort: 3
                        },
                        description: {
                            enabled: false,
                            colName: 'Description',
                            align: 'left',
                            sort: 4,
                            format: 'full'
                        },
                        count: {
                            enabled: false,
                            colName: 'Count',
                            align: 'center',
                            sort: 5
                        }
                    },
                    showCreateButton: true,
                    sortOption: TABLE_SORT_OPTION.MANUAL,
                    showOnlyOwnEffects: false,
                    suggestExistingEffects: false,
                    cssClass: '',
                    role: CONST.USER_ROLES.NONE,
                    permission: 0,
                    tooltip: '',
                    visibilityFormula: '',
                    templateAddress: '',
                    contents: [],
                    rowLayout: {},
                    title: '',
                    hideEmpty: false
                }).toJSON()
            ];
        }
        super(data, context);
    }
    /**
     * Is this item a Template ?
     */
    get isTemplate() {
        return (this.type === '_equippableItemTemplate' || this.type === 'subTemplate' || this.type === 'userInputTemplate');
    }
    /**
     * Is this item an assignable Template ?
     */
    get isAssignableTemplate() {
        return this.type === '_equippableItemTemplate';
    }
    /**
     * Template system in charge of generic templating handling
     */
    get templateSystem() {
        if (!this._templateSystem) {
            this._templateSystem = new TemplateSystem(this);
        }
        return this._templateSystem;
    }
    /**
     * @ignore
     *  @returns {EmbeddedCollection<CustomItem, ItemData>}
     */
    get items() {
        let baseCollection = game.items;
        if (this.isEmbedded) {
            baseCollection = this.parent.items;
        }
        return new Collection(baseCollection
            .filter((item) => item.system.container && this.id && item.system.container === this.id)
            .map((item) => [item.id, item]));
    }
    getItems() {
        return this.items;
    }
    /**
     * @return {CustomActor | CustomItem | null}
     */
    getParent() {
        return this.system.container
            ? this.isEmbedded
                ? this.parent.items.get(this.system.container)
                : game.items.find((item) => item.id === this.system.container)
            : this.parent;
    }
    getParentCollection() {
        if (this.isEmbedded) {
            return this.parent.items;
        }
        else {
            if (this.pack) {
                return game.packs.get(this.pack).index;
            }
            else {
                return game.items;
            }
        }
    }
    /**
     * Returns the list of the ids of items containing this item
     * @returns {Array<string>}
     */
    getAllContainerIds() {
        const parent = this.getParent();
        if (!(parent instanceof CustomItem)) {
            return [];
        }
        return [parent.id, ...parent.getAllContainerIds()];
    }
    /**
     * Is the current user allowed to edit Item Modifiers?
     * @returns {boolean}
     */
    get canEditModifiers() {
        return game.user.hasRole(game.settings.get(game.system.id, 'minimumRoleEditItemModifiers'));
    }
    /**
     * @override
     * @ignore
     */
    _onCreate(data, options, userId) {
        super._onCreate(data, options, userId);
        if (this.permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            if (!data.flags?.[game.system.id]?.version) {
                this.setFlag(game.system.id, 'version', game.system.version);
            }
            if (!this.parent) {
                this.update({
                    system: {
                        uniqueId: data._id
                    }
                });
            }
        }
    }
    async _preDelete(options, user) {
        // Handling of nested items
        let parentCollection = game.items;
        if (this.isEmbedded) {
            parentCollection = this.parent.items;
        }
        parentCollection
            .filter((item) => item.system.container === this.id)
            .forEach((item) => {
            item.delete();
        });
        super._preDelete(options, user);
    }
    /**
     * @override
     * @ignore
     */
    _preCreateEmbeddedDocuments(embeddedName, result, options, userId) {
        if (embeddedName === 'Item') {
            if (this.isTemplate) {
                result.splice(0, result.length);
            }
            else {
                const idxToRemove = [];
                for (const document of result) {
                    if (document.type !== 'equippableItem') {
                        idxToRemove.push(result.indexOf(document));
                    }
                }
                for (let i = idxToRemove.length - 1; i >= 0; i--) {
                    result.splice(idxToRemove[i], 1);
                }
            }
        }
        else {
            super._preCreateEmbeddedDocuments(embeddedName, result, options, userId);
        }
    }
    //@ts-expect-error Too hard to type...
    toObject() {
        const result = super.toObject();
        result.items = [];
        for (const subItem of this.items) {
            result.items.push(subItem.toObject());
        }
        return result;
    }
    clone(data = {}, options = { save: false }) {
        const newItem = super.clone(data, options);
        for (const subItem of this.items ?? []) {
            subItem.clone({ system: { container: newItem.id } }, { ...options, folder: CustomItem.getEmbeddedItemsFolder() });
        }
        return newItem;
    }
    /**
     * Get all ActiveEffects that are created on this Item.
     * @yields {ActiveEffect}
     * @returns {Generator<ActiveEffect, void, void>}
     */
    *allApplicableEffects({ excludeExternal = false, excludeTransfer = true } = {}) {
        for (const effect of this.effects) {
            if (!(excludeTransfer && effect.transfer))
                yield effect;
        }
        if (!excludeExternal) {
            for (const item of this.getItems()) {
                for (const effect of item.effects) {
                    if (effect.transfer)
                        yield effect;
                }
            }
        }
    }
    static async create(data, options) {
        const newItem = await super.create(data, options);
        for (const subItem of data.items ?? []) {
            subItem.system.container = newItem.id;
            await CustomItem.create(subItem, { ...options, folder: this.getEmbeddedItemsFolder() });
        }
        return newItem;
    }
    /**
     * Prepare creation data for the provided items and any items contained within them. The data created by this method
     * can be passed to `createDocuments` with `keepId` always set to true to maintain links to container contents.
     * @param  items                     Items to create.
     * @param Container                     Container for the items.
     * @returns                Data for items to be created.
     */
    static async createWithContents(items, container) {
        const depth = 0;
        const created = [];
        const createItemData = async (item, containerId, depth) => {
            let newItemData;
            if (!item) {
                return;
            }
            if (item instanceof Item) {
                newItemData = item.toObject();
            }
            else {
                newItemData = item;
            }
            newItemData = foundry.utils.mergeObject(newItemData, {
                'system.container': containerId,
                folder: this.getEmbeddedItemsFolder()
            });
            newItemData._id = foundry.utils.randomID();
            created.push(newItemData);
            if (item.items) {
                if (depth > CustomItem.MAX_DEPTH) {
                    ui.notifications.warn(game.i18n.format('CSB.UserMessages.ItemMaxDepth', { depth: CustomItem.MAX_DEPTH }));
                }
                for (const doc of item.items)
                    await createItemData(doc, newItemData._id, depth + 1);
            }
        };
        for (const item of items)
            await createItemData(item, container?.id, depth);
        return created;
    }
    /**
     * @ignore
     */
    toCompendium(pack, options) {
        const data = super.toCompendium(pack, options);
        data.items = [];
        for (const item of this.items) {
            data.items.push(item.toCompendium(pack, options));
        }
        return data;
    }
    /**
     * @ignore
     */
    exportToJSON(options = {}) {
        super.exportToJSON({
            ...options,
            keepId: true
        });
    }
    /**
     * @override
     * @ignore
     */
    async importFromJSON(json, subFolder = false) {
        const updated = await super.importFromJSON(json);
        const imported = JSON.parse(json);
        const res = await CustomItem.create({
            ...updated,
            _id: imported._id,
            folder: subFolder ? CustomItem.getEmbeddedItemsFolder() : updated.folder
        }, {
            keepId: true
        });
        for (const subItemJSON of imported.items) {
            subItemJSON.system.container = res.id;
            CustomItem.create({
                ...subItemJSON,
                folder: CustomItem.getEmbeddedItemsFolder()
            });
        }
        updated.delete();
        return res;
    }
    /**
     * @override
     * @ignore
     */
    prepareDerivedData() {
        if (this.type !== 'base')
            this.templateSystem.prepareData();
    }
}
/**
 * Maximum depth items can be nested in containers.
 * @type {number}
 */
CustomItem.MAX_DEPTH = 5;
CustomItem.EMBEDDED_ITEMS_FOLDER_NAME = 'CSB - Embedded Items Folder - DO NOT RENAME OR REMOVE';
Hooks.on('renderItemDirectory', (directory) => {
    const activeEffectContainersIds = game
        .items.filter((item) => {
        return item.type === 'activeEffectContainer';
    })
        .map((item) => item.id);
    if (!activeEffectContainersIds)
        return;
    const $html = $(directory.element);
    activeEffectContainersIds.forEach((activeEffectContainersId) => {
        const $li = $html.find(`li[data-entry-id="${activeEffectContainersId}"]`);
        $li.remove();
    });
});
