/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import templateFunctions from '../template-functions.js';
import Formula from '../../formulas/Formula.js';
import Logger from '../../Logger.js';
import { AlphanumericPatternError } from '../../errors/ComponentValidationError.js';
/**
 * Abstract component class
 * @abstract
 */
class Component {
    /**
     * Component constructor
     * @constructor
     * @param componentProps Component properties
     */
    constructor({ key, templateAddress, cssClass = '', role = 0, permission = 0, tooltip = '', visibilityFormula = '', parent }) {
        if (this.constructor === Component) {
            throw new TypeError('Abstract class "Component" cannot be instantiated directly');
        }
        this._key = key;
        this._templateAddress = templateAddress;
        this._cssClass = cssClass;
        this._role = role;
        this._permission = permission;
        this._tooltip = tooltip;
        this._visibilityFormula = visibilityFormula;
        this._parent = parent;
    }
    /**
     * Component key
     */
    get key() {
        return this._key;
    }
    /**
     * Component property key
     */
    get propertyKey() {
        return undefined;
    }
    /**
     * Component tooltip
     */
    get tooltip() {
        return this._tooltip;
    }
    /**
     * Component address in template, i.e. component path from entity.system object
     */
    get templateAddress() {
        return this._templateAddress;
    }
    /**
     * Additional CSS class
     */
    get cssClass() {
        return this._cssClass;
    }
    /**
     * Component minimum role
     */
    get role() {
        return this._role;
    }
    /**
     * Component minimum permission
     */
    get permission() {
        return this._permission;
    }
    /**
     * Component raw visibility formula
     */
    get visibilityFormula() {
        return this._visibilityFormula;
    }
    /**
     * Component should have header on template mode
     * @returns {boolean}
     */
    get addWrapperOnTemplate() {
        return this.constructor.addWrapperOnTemplate;
    }
    /**
     * Component is draggable
     */
    get draggable() {
        return this.constructor.draggable;
    }
    /**
     * Returns component's parent
     */
    get parent() {
        return this._parent;
    }
    /**
     * Check if component can be rendered for the current user
     * @param entity The Template System used to render the component
     * @param options Options to compute the visibility formula
     * @returns `true` if the component can be rendered, `false` otherwise
     */
    canBeRendered(entity, options = {}) {
        if (entity.isTemplate) {
            return true;
        }
        let canRender = game.user.role >= this.role && entity.entity.permission >= this.permission;
        if (this.visibilityFormula) {
            const formula = new Formula(this.visibilityFormula);
            try {
                const formulaProps = {
                    ...entity.system?.props,
                    ...options.customProps
                };
                formula.computeStatic(formulaProps, {
                    ...options,
                    source: `${this.key}.visibilityFormula`,
                    triggerEntity: entity,
                    reference: options.reference
                });
                canRender = canRender && !!formula.result; // Cast to boolean
            }
            catch (_e) {
                canRender = false;
            }
        }
        return canRender;
    }
    /**
     * Handles the component rendering, including checking if component can be rendered.
     * This function should not be overriden, instead override the _getElement function to actually render your component.
     * @param entity Rendered entity (actor or item)
     * @param isEditable Is the component editable by the current user ?
     * @param options Additional options usable by the final Component
     * @return The jQuery element holding the component
     */
    async render(entity, isEditable = true, options = {}) {
        const element = await this._getElement(entity, isEditable, {
            ...options,
            customProps: {
                ...options.customProps,
                this: this.key && !entity.isTemplate ? foundry.utils.getProperty(entity.system.props, this.key) : null
            }
        });
        return this.canBeRendered(entity, options) ? element : $('<div style="display: none"></div>').append(element);
    }
    /**
     * Actual function which renders the component.
     * @abstract
     * @param entity Rendered entity (actor or item)
     * @param _isEditable Is the component editable by the current user ?
     * @param options Additional options usable by the final Component
     * @return The jQuery element holding the component
     */
    async _getElement(entity, _isEditable = true, options = {}) {
        let jQElement = $('<div></div>');
        jQElement.addClass('custom-system-component-contents');
        jQElement.addClass(this.key ?? '');
        let cssClass = this.cssClass;
        if (cssClass && !entity.isTemplate) {
            try {
                cssClass =
                    (await ComputablePhrase.computeMessage(cssClass, {
                        ...entity.system.props,
                        ...options.customProps
                    }, {
                        ...options,
                        source: `${this.key}.css`,
                        triggerEntity: entity,
                        reference: options.reference
                    })).result ?? 'ERROR';
            }
            catch (err) {
                Logger.error(err.message, err);
                cssClass = 'ERROR';
            }
        }
        jQElement.addClass(cssClass);
        if (this.tooltip) {
            let tooltipText = this.tooltip;
            if (!entity.isTemplate) {
                try {
                    tooltipText =
                        (await ComputablePhrase.computeMessage(this.tooltip, {
                            ...entity.system.props,
                            ...options.customProps
                        }, {
                            ...options,
                            source: `${this.key}.tooltip`,
                            triggerEntity: entity,
                            reference: options.reference
                        })).result ?? 'ERROR';
                }
                catch (err) {
                    Logger.error(err.message, err);
                    tooltipText = 'ERROR';
                }
            }
            jQElement.attr('title', tooltipText);
        }
        if (entity.isTemplate) {
            if (this.templateAddress !== 'body' && this.templateAddress !== 'header') {
                let dragHandle = jQElement;
                if (this.addWrapperOnTemplate) {
                    const templateWrapper = $('<div></div>');
                    templateWrapper.addClass('custom-system-editable-panel');
                    templateWrapper.addClass(cssClass);
                    const panelTitle = $('<div></div>');
                    panelTitle.addClass('custom-system-editable-panel-title custom-system-editable-component');
                    if (this.key) {
                        panelTitle.addClass(`custom-system-edit-${this.key}`);
                    }
                    panelTitle.text(`${this.constructor.getPrettyName()}${this.key ? ` ${this.key}` : ''}`);
                    panelTitle.on('click', () => {
                        this.editComponent(entity);
                    });
                    templateWrapper.append(panelTitle);
                    templateWrapper.append(jQElement);
                    jQElement = templateWrapper;
                    dragHandle = panelTitle;
                }
                if (this.draggable) {
                    this._handleDragEvents(entity, jQElement, dragHandle);
                }
            }
        }
        jQElement.addClass('custom-system-component-root');
        return jQElement;
    }
    /**
     * Go through the component to get every keyed component in a flat object
     * @returns A flat map of keyed components
     */
    getComponentMap() {
        const componentMap = {};
        if (this.key && this.key !== '') {
            componentMap[this.key] = this;
        }
        return componentMap;
    }
    /**
     * Handles drag & drop events for Components
     * @param entity Rendered entity (actor or item)
     * @param jQElement The JQuery element being dragged
     * @param dragHandle The JQuery element acting as the handle. This can be part of the jQElement or be the jQElement itself
     */
    _handleDragEvents(entity, jQElement, dragHandle) {
        dragHandle.attr('draggable', 'true');
        dragHandle.on('dragstart', (ev) => {
            if (ev.originalEvent) {
                ev.originalEvent.stopPropagation();
                if (ev.originalEvent.dataTransfer) {
                    ev.originalEvent.dataTransfer.effectAllowed = 'copyMove';
                    ev.originalEvent.dataTransfer.dropEffect = 'move';
                }
            }
            globalThis.copiedComponent = {
                sourceId: entity.uuid,
                component: this
            };
            setTimeout(() => {
                jQElement.hide();
            }, 0);
        });
        dragHandle.on('dragend', () => {
            $('.custom-system-drop-target').remove();
            entity.render(false);
        });
        if (this.parent?.constructor?.droppable) {
            dragHandle.on('dragover', (ev) => {
                this.dragOverComponent(entity, ev);
            });
            dragHandle.on('dragenter', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                $('.custom-system-drop-target').remove();
                const dropTarget = $('<div>Insert here</div>');
                dropTarget.addClass('custom-system-drop-target');
                dropTarget.on('dragover', (ev) => {
                    this.dragOverComponent(entity, ev);
                });
                dropTarget.on('dragleave', () => {
                    $('.custom-system-drop-target').remove();
                });
                dropTarget.on('drop', (event) => {
                    this.dropOnComponent(entity, event, this.parent, {
                        insertBefore: this
                    });
                });
                dropTarget.insertBefore(jQElement);
            });
            dragHandle.on('drop', (event) => {
                this.dropOnComponent(entity, event, this.parent, {
                    insertBefore: this
                });
            });
        }
    }
    /**
     * Handles component editor dialog
     * @param entity Template containing the component
     * @param additionalAttributes Additional attributes. Currently used for extensibleTables, like the column name
     * @param allowedComponents Allowed components to replace this component with
     */
    editComponent(entity, additionalAttributes, allowedComponents) {
        const componentJSON = this.toJSON();
        let componentData = componentJSON;
        if (additionalAttributes) {
            componentData = foundry.utils.mergeObject(componentJSON, additionalAttributes);
        }
        // Open dialog to edit component
        templateFunctions.component((action, component) => {
            // This is called on dialog validation
            // Dialog has many buttons, clicked button is returned in action
            // New component data is returns in component
            // If we edit the component
            if (action === 'edit') {
                this.update(entity, component);
            }
            else if (action === 'delete') {
                this.delete(entity);
            }
        }, {
            componentData,
            allowedComponents,
            isDynamicTable: additionalAttributes !== undefined,
            entity
        });
    }
    /**
     * Saves component in database
     * @param entity Template containing the component
     */
    async save(entity) {
        await entity.saveTemplate();
    }
    /**
     * Updates component with the data from the edition popup
     * @param entity Template containing the component
     * @param data JSON data of the component to edit
     */
    async update(entity, data) {
        const newComponent = foundry.utils.mergeObject(this.toJSON(), data);
        this.parent.replaceComponent(this, newComponent);
        // After actions have been taken care of, save entity
        await this.save(entity);
    }
    /**
     * Deletes component
     * @param entity Template containing the component
     * @param triggerSave Whether to save the template after deletion or not
     */
    async delete(entity, triggerSave = true) {
        this.parent.deleteComponent(this);
        if (triggerSave) {
            await this.save(entity);
        }
    }
    /**
     * Sort after in the same container
     * @param entity Template containing the component
     */
    async sortAfterInParent(entity) {
        this.parent.sortComponentAfter(this);
        // After actions have been taken care of, save entity
        await this.save(entity);
    }
    /**
     * Sort before in the same container
     * @param entity Template containing the component
     */
    async sortBeforeInParent(entity) {
        this.parent.sortComponentBefore(this);
        // After actions have been taken care of, save entity
        await this.save(entity);
    }
    /**
     * Handles the dragover event
     * @param entity Template containing the component
     * @param event The DragEvent
     */
    async dragOverComponent(entity, event) {
        event.stopPropagation();
        event.preventDefault();
        const sourceId = globalThis.copiedComponent?.sourceId;
        if (event.originalEvent?.dataTransfer) {
            event.originalEvent.dataTransfer.dropEffect = event.ctrlKey || sourceId !== entity.uuid ? 'copy' : 'move';
        }
    }
    /**
     * Handles components and subtemplates drops on a component
     * @param entity Template containing the component
     * @param event The DropEvent
     * @param insertionTarget The target Container
     * @param insertionOptions Options to create the component
     */
    async dropOnComponent(entity, event, insertionTarget, insertionOptions) {
        event.stopPropagation();
        event.preventDefault();
        let dropData;
        try {
            dropData = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
        }
        catch (_e) {
            null;
        }
        if (dropData) {
            try {
                const item = await Item.fromDropData(dropData);
                if (item && item.type === 'subTemplate') {
                    try {
                        await insertionTarget.addNewComponent(entity, item.system.body.contents, insertionOptions);
                    }
                    catch (e) {
                        ui.notifications.error(e.message);
                    }
                }
                else {
                    ui.notifications.error(game.i18n.localize('CSB.UserMessages.WrongDragOnTemplate'));
                }
            }
            catch (_e) {
                null;
            }
        }
        const droppedData = globalThis.copiedComponent;
        const sourceId = droppedData?.sourceId;
        const droppedComponent = droppedData?.component;
        if (droppedComponent) {
            let isMovement = false;
            if (sourceId === entity.uuid && !event.ctrlKey && !event.metaKey) {
                await droppedComponent.delete(entity, false);
                isMovement = true;
            }
            try {
                await insertionTarget.addNewComponent(entity, droppedComponent.toJSON(), insertionOptions, isMovement);
                globalThis.copiedComponent = null;
            }
            catch (e) {
                ui.notifications.error(e.message);
            }
        }
    }
    /**
     * Returns serialized component
     * Should be overridden by each Component subclass
     * @returns The JSONified component
     */
    toJSON() {
        return {
            key: this._key,
            cssClass: this.cssClass,
            role: this.role,
            permission: this.permission,
            tooltip: this.tooltip,
            visibilityFormula: this.visibilityFormula,
            type: this.constructor.getTechnicalName()
        };
    }
    /**
     * Creates a new component from a JSON description
     * Should be implemented by each Component subclass
     * @abstract
     * @throws {Error} If not implemented
     * @returns The new Component
     */
    static fromJSON(_json, _templateAddress, _parent = null) {
        throw new Error('You must implement this function');
    }
    /**
     * Gets technical name for this component's type
     * @return The technical name
     * @throws {Error} If not implemented
     */
    static getTechnicalName() {
        // V13 DEPRECATION WARNING
        Logger.warn(`static getTechnicalName was not implemented for Component Type ${this.constructor.name}. This will be mandatory for v5.0.0, with the Foundy 13 compatibility.`);
        return 'component';
    }
    /**
     * Gets pretty name for this component's type
     * Should be implemented by each Component subclass
     * @abstract
     * @throws {Error} If not implemented
     * @returns A pretty name for the component
     */
    static getPrettyName() {
        throw new Error(`Function not implemented : static getPrettyName(): string (in ${this.constructor.name}`);
    }
    /**
     * Get configuration form for component creation / edition
     * Should be implemented by each Component subclass
     * @abstract
     * @throws {Error} If not implemented
     * @returns A JQuery Element containing the form
     */
    static async getConfigForm(_existingComponent, _entity) {
        throw new Error('You must implement this function');
    }
    /**
     * Can be used to attach Event Listeners to the config form
     * Can be overridden by each Component subclass
     * @abstract
     * @param _html The configuration form to attach events to
     */
    static attachListenersToConfigForm(_html) { }
    /**
     * Extracts configuration from submitted HTML form after Component Configuration dialog validation
     * Should be overridden by each Component subclass
     * @abstract
     * @param html The submitted HTML form
     * @throws {ComponentValidationError} If configuration contains validation errors
     * @returns The JSON version of the new Component configuration
     */
    static extractConfig(html) {
        const fieldData = {};
        // Fetch fields existing for every type of components
        const genericFields = $(html).find('.custom-system-component-generic-fields input, .custom-system-component-generic-fields select, .custom-system-component-generic-fields textarea');
        // Store their value in an object
        for (const field of genericFields) {
            const jQField = $(field);
            fieldData[jQField.data('key')] = jQField.val();
        }
        return fieldData;
    }
    /**
     * Validates if the passed JSON-Object meets all criteria for Component creation.
     * Can be overridden by each Component's subclass.
     * @param json The new Component's JSON
     * @throws {ComponentValidationError} If configuration contains validation errors
     */
    static validateConfig(json) {
        if (json.key && !json.key.match(/^[a-zA-Z0-9_]+$/)) {
            throw new AlphanumericPatternError(game.i18n.localize('CSB.ComponentProperties.ComponentKey'), json);
        }
    }
}
/**
 * The value type of this component. This is used to display an input field in the Dynamic Table's templates
 * This should be 'none' | 'string' | 'number' | 'boolean'
 */
Component.valueType = 'none';
/**
 * Should be true if the template version should show a wrapper, as is made for templates
 */
Component.addWrapperOnTemplate = false;
/**
 * Should be true if the component is draggable to be copied
 */
Component.draggable = true;
export default Component;
