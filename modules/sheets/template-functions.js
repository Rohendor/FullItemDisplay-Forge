/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * @ignore
 * @module
 */
import CustomDialog from '../applications/custom-dialog.js';
import { getLocalizedPermissionList, getLocalizedRoleList, getLocalizedAlignmentList } from '../utils.js';
import { NotUniqueError, RequiredFieldError } from '../errors/ComponentValidationError.js';
let editTabDialog = null;
let componentDialog = null;
let attributesDialog = null;
let attributeBarsDialog = null;
let displaySettingsDialog = null;
let modifiersDialog = null;
let reloadTemplatesDialog = null;
const mathjsBlacklist = new Set(['end', 'height', 'name', 'uuid', 'id', 'img', 'index', 'item', 'target', 'this']);
/**
 * Dialog for tab creation / edition
 * @param callback The callback to call on Save click
 * @param {TabJson | null} tabData The existing Tab data, if any
 * @returns {Promise<void>}
 * @ignore
 */
const editTab = async (callback, tabData = null) => {
    // Render the dialog contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/edit-tab.hbs`, {
        ...tabData,
        permissionList: getLocalizedPermissionList('number'),
        roleList: getLocalizedRoleList('number')
    });
    if (editTabDialog && editTabDialog.rendered) {
        await editTabDialog.close();
    }
    // Create the dialog
    editTabDialog = new Dialog({
        title: tabData
            ? game.i18n.format('CSB.ComponentProperties.Tab.Dialog.TitleEdit', { TAB_KEY: tabData.key })
            : game.i18n.localize('CSB.ComponentProperties.Tab.Dialog.TitleCreate'),
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    let tabData = {};
                    // Ensure name and key are entered
                    tabData.name = html.find('#tab-name').val();
                    tabData.key = html.find('#tab-key').val();
                    tabData.tooltip = html.find('#tab-tooltip').val();
                    tabData.role = html.find('#tabRole').val();
                    tabData.permission = html.find('#tabPerm').val();
                    tabData.visibilityFormula = html.find('#tabVisible').val();
                    if (!tabData.name || !tabData.key) {
                        throw new Error(game.i18n.localize('CSB.ComponentProperties.Tab.Dialog.MissingData'));
                    }
                    else {
                        callback(tabData);
                    }
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'validate',
        render: (html) => {
            html.find('.custom-system-collapsible-block .custom-system-collapsible-block-title').prepend($('<i class="fas fa-caret-right"></i>'));
            html.find('.custom-system-collapsible-block .custom-system-collapsible-block-title').on('click', (ev) => {
                let target = $(ev.currentTarget);
                let contents = target
                    .parent('.custom-system-collapsible-block')
                    .children('.custom-system-collapsible-block-hide');
                if (contents.is(':visible')) {
                    target.children('.fa-caret-down').removeClass('fa-caret-down').addClass('fa-caret-right');
                    contents.slideUp(200);
                }
                else {
                    target.children('.fa-caret-right').removeClass('fa-caret-right').addClass('fa-caret-down');
                    contents.slideDown(200);
                }
            });
        }
    }, {
        height: 'auto'
    });
    editTabDialog.render(true);
};
/**
 * Dialog for component creation / edition
 * @param callback The callback to call on button click
 * @param {Object} [options] Dialog options
 * @param {Object} [options.componentData] The existing component's data, if any
 * @param {Array<String>} [options.allowedComponents] Allowed components
 * @param {boolean} [options.isDynamicTable] Is the popup called from a dynamic table ?
 * @param {TemplateSystem} [options.entity] The entity linked to this component window (actor or item)
 * @returns {Promise<void>}
 * @ignore
 */
const component = async (callback, { componentData = undefined, allowedComponents = undefined, isDynamicTable = false, entity = undefined }) => {
    // Render the dialog's contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/component.hbs`, {
        ...componentData,
        isDynamic: isDynamicTable,
        permissionList: getLocalizedPermissionList('number'),
        roleList: getLocalizedRoleList('number'),
        alignmentList: getLocalizedAlignmentList()
    });
    let mainDiv = $(content);
    let componentTypeSelect = mainDiv.find('#compType');
    for (let componentType of componentFactory.componentTypes) {
        if (!allowedComponents || allowedComponents.includes(componentType)) {
            let componentClass = componentFactory.getComponentClass(componentType);
            let componentDiv = $('<div></div>');
            componentDiv.addClass('custom-system-component-editor custom-system-' + componentType + '-editor');
            componentDiv.append(await componentClass.getConfigForm(componentData, entity));
            mainDiv.append(componentDiv);
            let typeOption = $('<option></option>');
            typeOption.attr('value', componentType);
            typeOption.text(componentClass.getPrettyName());
            if (componentData?.type === componentType) {
                typeOption.attr('selected', 'selected');
            }
            componentTypeSelect.append(typeOption);
        }
    }
    let editButtons = {};
    // If component data was provided, we can display the edit actions : Delete and Sort buttons
    if (componentData) {
        editButtons = {
            delete: {
                icon: '<i class="fas fa-trash"></i>',
                label: game.i18n.localize('Delete'),
                callback: () => {
                    Dialog.confirm({
                        title: game.i18n.localize('CSB.ComponentProperties.ComponentDialog.Delete.Title'),
                        content: `<p>${game.i18n.localize('CSB.ComponentProperties.ComponentDialog.Delete.Content')}</p>`,
                        yes: () => {
                            // Just call callback with delete, and no new component data
                            callback('delete');
                            componentDialog.close();
                        }
                    });
                    return false;
                }
            }
        };
    }
    if (componentDialog && componentDialog.rendered) {
        await componentDialog.close();
    }
    // Create dialog
    componentDialog = new CustomDialog({
        title: game.i18n.localize('CSB.ComponentProperties.ComponentDialog.Edit.Title'),
        content: mainDiv[0].outerHTML,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    const newCompType = html.find('#compType').val();
                    const componentClass = componentFactory.getComponentClass(newCompType);
                    // Retrieve HTML-data only from relevant parts to avoid selector-collisions
                    const genericJQueryData = html.find('.custom-system-component-generic-fields').clone();
                    const specificJQueryData = html.find('.custom-system-' + newCompType + '-editor').clone();
                    const mergedJQueryData = $('<div></div>').append(genericJQueryData, specificJQueryData);
                    mergedJQueryData.find('string-tags').each((idx, elt) => {
                        const inputReplace = $('<input></input>');
                        inputReplace.attr('id', elt.id);
                        inputReplace.val(html.find(`#${elt.id}`).val());
                        $(elt).replaceWith(inputReplace);
                    });
                    mergedJQueryData.find('select').each((idx, elt) => {
                        $(elt).val(html.find(`#${elt.id}`).val());
                    });
                    const fieldData = componentClass.extractConfig(mergedJQueryData);
                    componentClass.validateConfig(fieldData);
                    if (isDynamicTable && fieldData.key === '') {
                        throw new RequiredFieldError(game.i18n.localize('CSB.ComponentProperties.ComponentKey'), fieldData);
                    }
                    if (fieldData.key !== componentData?.key &&
                        !isDynamicTable &&
                        entity.getKeys().has(fieldData.key)) {
                        throw new NotUniqueError(game.i18n.localize('CSB.ComponentProperties.ComponentKey'), fieldData);
                    }
                    callback('edit', fieldData);
                }
            },
            ...editButtons,
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        render: (html) => {
            const typeSelect = html.find('.custom-system-component-editor-dialog #compType');
            const componentType = typeSelect.val();
            componentFactory.componentTypes
                .filter((componentType) => !allowedComponents || allowedComponents.includes(componentType))
                .forEach((componentType) => {
                const componentClass = componentFactory.getComponentClass(componentType);
                componentClass.attachListenersToConfigForm(html.find('.custom-system-component-editor-dialog .custom-system-' + componentType + '-editor'));
            });
            html.find('.custom-system-component-editor-dialog .custom-system-' + componentType + '-editor').slideDown(200);
            // Change displayed fields based on previous and new types
            function changeDisplayedControls(ev) {
                const target = $(ev.currentTarget);
                const newType = target.val();
                typeSelect.parents('.dialog').css('height', 'auto');
                // Hide previous type's fields
                html.find('.custom-system-component-editor-dialog .custom-system-component-editor').slideUp(200);
                // Show new type's fields
                html.find('.custom-system-component-editor-dialog .custom-system-' + newType + '-editor').slideDown(200);
            }
            // Each time the type Select is clicked, we save its current type
            // Each time it changed, we change the type display
            html.find('.custom-system-component-editor-dialog #compType').on('change', changeDisplayedControls);
            function checkComponentKey() {
                const target = html.find('.custom-system-component-editor-dialog #compKey');
                let val = target.val();
                if (val && val.match(/^[a-zA-Z0-9_]+$/)) {
                    if (mathjsBlacklist.has(val)) {
                        html.find('.custom-system-key-warning').show();
                    }
                    else {
                        try {
                            math.parse(val);
                            math.evaluate(val);
                            html.find('.custom-system-key-warning').show();
                        }
                        catch (err) {
                            html.find('.custom-system-key-warning').hide();
                        }
                    }
                }
            }
            html.find('.custom-system-component-editor-dialog #compKey').on('change', checkComponentKey);
            checkComponentKey();
            html.find('.custom-system-collapsible-block .custom-system-collapsible-block-title').prepend($('<i class="fas fa-caret-right"></i>'));
            html.find('.custom-system-collapsible-block .custom-system-collapsible-block-title').on('click', (ev) => {
                let target = $(ev.currentTarget);
                let contents = target
                    .parent('.custom-system-collapsible-block')
                    .children('.custom-system-collapsible-block-hide');
                if (contents.is(':visible')) {
                    target.children('.fa-caret-down').removeClass('fa-caret-down').addClass('fa-caret-right');
                    contents.slideUp(200);
                }
                else {
                    target.children('.fa-caret-right').removeClass('fa-caret-right').addClass('fa-caret-down');
                    contents.slideDown(200);
                }
            });
            html.on('keydown', (event) => {
                event.stopPropagation();
            });
        }
    }, {
        height: 'auto'
    });
    componentDialog.render(true);
};
/**
 * Dialog for hidden attributes creation / edition
 * @param callback The callback to call on button click
 * @param attr The existing hidden attributes
 * @returns {Promise<void>}
 * @ignore
 */
const attributes = async (callback, attr) => {
    // Render the dialog's contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/attributes.hbs`, {
        attribute: attr
    });
    if (attributesDialog && attributesDialog.rendered) {
        await attributesDialog.close();
    }
    // Create dialog
    attributesDialog = new Dialog({
        title: game.i18n.localize('CSB.Attributes.EditHiddenAttributesDialog.Title'),
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    // Fetch all attribute rows
                    let attrEltList = html.find('tr.custom-system-hidden-attribute');
                    let attrList = [];
                    // For each of them, recover key and formula, and ensure none is empty
                    for (let attrElt of attrEltList) {
                        let attrName = $(attrElt).find('.custom-system-attribute-name').val();
                        let attrFormula = $(attrElt).find('.custom-system-attribute-formula').val();
                        if (attrName === '' || attrFormula === '') {
                            throw new Error(game.i18n.localize('CSB.Attributes.EditHiddenAttributesDialog.MissingData'));
                        }
                        attrList.push({ name: attrName, value: attrFormula });
                    }
                    callback(attrList);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'validate',
        render: (html) => {
            let dialogElt = html.find('.custom-system-attributes').parents('.dialog');
            dialogElt.css({ 'max-height': '75%' });
            // Add attributes button
            html.find('.custom-system-attributes #addAttribute').on('click', (ev) => {
                const target = $(ev.currentTarget);
                // Last row contains only the add button
                const lastRow = target.parents('tr');
                // Create new row
                const newRow = $(html).find('#custom-system-hidden-attribute-template')[0].content.cloneNode(true);
                // Insert new row before control row
                lastRow.before(newRow);
            });
            // Delete attribute button
            html.on('click', '.custom-system-attributes .custom-system-delete-hidden-attribute', (ev) => {
                // Get attributes row
                const target = $(ev.currentTarget);
                let row = target.parents('tr');
                // Remove it from the DOM
                $(row).remove();
            });
        }
    }, {
        height: 'auto'
    });
    attributesDialog.render(true);
};
/**
 * Dialog for attribute bars creation / edition
 * @param callback The callback to call on button click
 * @param attr The existing attribute bars
 * @returns {Promise<void>}
 * @ignore
 */
const attributeBars = async (callback, attr) => {
    for (let attrName in attr) {
        if (attr[attrName]) {
            attr[attrName].name = attrName;
        }
    }
    // Render the dialog's contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/attributeBars.hbs`, {
        attribute: attr
    });
    if (attributeBarsDialog && attributeBarsDialog.rendered) {
        await attributeBarsDialog.close();
    }
    // Create dialog
    attributeBarsDialog = new Dialog({
        title: game.i18n.localize('CSB.Attributes.EditAttributeBarsDialog.Title'),
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    // Fetch all attribute rows
                    let attrBarEltList = html.find('tr.custom-system-attribute-bar');
                    let attrBarList = {};
                    // For each of them, recover key and formula, and ensure none is empty
                    for (let attrBarElt of attrBarEltList) {
                        let attrBarName = $(attrBarElt).find('.custom-system-attribute-name').val();
                        let attrBarValue = $(attrBarElt).find('.custom-system-attribute-value').val();
                        let attrBarMax = $(attrBarElt).find('.custom-system-attribute-max').val();
                        if (attrBarName === '' || attrBarValue === '' || attrBarMax === '') {
                            throw new Error(game.i18n.localize('CSB.Attributes.EditAttributeBarsDialog.MissingData'));
                        }
                        attrBarList[attrBarName] = { value: attrBarValue, max: attrBarMax, editable: false };
                    }
                    callback(attrBarList);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'validate',
        render: (html) => {
            let dialogElt = html.find('.custom-system-attribute-bars').parents('.dialog');
            dialogElt.css({ 'max-height': '75%' });
            dialogElt.css({ 'min-width': '550px' });
            // Add attributes button
            html.find('.custom-system-attribute-bars #addAttributeBar').on('click', (ev) => {
                const target = $(ev.currentTarget);
                // Last row contains only the add button
                const lastRow = target.parents('tr');
                // Create new row
                const newRow = $(html).find('#custom-system-attribute-bar-template')[0].content.cloneNode(true);
                // Insert new row before control row
                lastRow.before(newRow);
            });
            // Delete attribute button
            html.on('click', '.custom-system-attribute-bars .custom-system-delete-attribute-bar', (ev) => {
                // Get attributes row
                const target = $(ev.currentTarget);
                let row = target.parents('tr');
                // Remove it from the DOM
                $(row).remove();
            });
        }
    }, {
        height: 'auto',
        width: 'auto'
    });
    attributeBarsDialog.render(true);
};
/**
 * Dialog for display settings edition
 * @param callback The callback to call on button click
 * @param attr The existing display settings
 * @returns {Promise<void>}
 * @ignore
 */
const displaySettings = async (callback, attr) => {
    // Render the dialog's contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/display.hbs`, attr);
    if (displaySettingsDialog && displaySettingsDialog.rendered) {
        await displaySettingsDialog.close();
    }
    // Create dialog
    displaySettingsDialog = new Dialog({
        title: game.i18n.localize('CSB.Display.EditDialog.Title'),
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    let width = $(html).find('#custom-system-display-width').val();
                    let height = $(html).find('#custom-system-display-height').val();
                    let fix_size = $(html).find('#custom-system-display-fix-size').is(':checked');
                    let pp_width = $(html).find('#custom-system-display-pp-width').val();
                    let pp_height = $(html).find('#custom-system-display-pp-height').val();
                    callback({ width, height, fix_size, pp_width, pp_height });
                }
            },
            default: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('CSB.Display.EditDialog.DefaultValues'),
                callback: () => {
                    let width = '600';
                    let height = '600';
                    let pp_width = '64';
                    let pp_height = '64';
                    callback({ width, height, pp_width, pp_height });
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'validate'
    });
    displaySettingsDialog.render(true);
};
const modifiers = async (callback, blocks) => {
    // Render the dialog's contents
    let content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/modifiers.hbs`, {
        blocks,
        MODIFIER_OPERATORS: {
            add: '+',
            multiply: 'x',
            subtract: '-',
            divide: '/',
            set: '='
        }
    });
    if (modifiersDialog && modifiersDialog.rendered) {
        await modifiersDialog.close();
    }
    // Create the dialog
    modifiersDialog = new Dialog({
        title: game.i18n.localize('CSB.Modifier.EditDialog.Title'),
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    let newModifiers = {};
                    let modifierBlocks = html.find('.custom-system-modifiers');
                    for (let block of modifierBlocks) {
                        if ($(block).data('block-editable')) {
                            let blockId = $(block).data('block-id');
                            // Fetch all attribute rows
                            let modifierEltList = $(block).find('tr.custom-system-modifier');
                            /**
                             * @type {Modifier[]}
                             */
                            let modifierList = [];
                            // For each of them, recover key and formula, and ensure none is empty
                            for (let modifierElt of modifierEltList) {
                                let modifierId = $(modifierElt).find('.custom-system-modifier-id')?.val() ||
                                    foundry.utils.randomID();
                                let modifierConditionalGroup = $(modifierElt)
                                    .find('.custom-system-modifier-conditionalGroup')
                                    .val();
                                let modifierPriority = $(modifierElt)
                                    .find('.custom-system-modifier-priority')
                                    .val();
                                let modifierKey = $(modifierElt).find('.custom-system-modifier-key').val();
                                let modifierOperator = $(modifierElt)
                                    .find('.custom-system-modifier-operator')
                                    .val();
                                let modifierFormula = $(modifierElt).find('.custom-system-modifier-formula').val();
                                let modifierDescription = $(modifierElt)
                                    .find('.custom-system-modifier-description')
                                    .val();
                                if (modifierKey === '' || modifierFormula === '') {
                                    throw new Error(game.i18n.localize('CSB.Modifier.EditDialog.MissingData'));
                                }
                                modifierList.push({
                                    id: modifierId,
                                    conditionalGroup: modifierConditionalGroup,
                                    priority: Number.isNaN(Number(modifierPriority)) ? 0 : Number(modifierPriority),
                                    key: modifierKey,
                                    operator: modifierOperator,
                                    formula: modifierFormula,
                                    description: modifierDescription
                                });
                            }
                            newModifiers[blockId] = modifierList;
                        }
                    }
                    callback(newModifiers);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'cancel',
        render: (html) => {
            let dialogElt = html.find('.custom-system-modifiers').parents('.dialog');
            dialogElt.css({ 'max-height': '75%' });
            html.find('.custom-system-block-title').on('click', (ev) => {
                let target = $(ev.currentTarget);
                let blockId = target.data('block-id');
                let modifiersDiv = html.find('#modifiers_' + blockId);
                if (modifiersDiv.is(':visible')) {
                    modifiersDiv.slideUp(500);
                    target.find('.fa-caret-down').addClass('fa-caret-right').removeClass('fa-caret-down');
                }
                else {
                    modifiersDiv.slideDown(500);
                    target.find('.fa-caret-right').addClass('fa-caret-down').removeClass('fa-caret-right');
                }
            });
            // Add attributes button
            html.find('.custom-system-modifiers #addModifier').on('click', (ev) => {
                const target = $(ev.currentTarget);
                // Last row contains only the add button
                const lastRow = target.parents('tr');
                // Create new row
                const newRow = $(html).find('#custom-system-modifier-template')[0].content.cloneNode(true);
                $(newRow).find('.custom-system-modifier-id').val(foundry.utils.randomID());
                // Insert new row before control row
                lastRow.before(newRow);
            });
            // Delete attribute button
            html.on('click', '.custom-system-modifiers .custom-system-delete-modifier', (ev) => {
                // Get attributes row
                const target = $(ev.currentTarget);
                let row = target.parents('tr');
                // Remove it from the DOM
                $(row).remove();
            });
            html.on('keydown', (event) => {
                event.stopPropagation();
            });
        }
    }, {
        height: 'auto',
        width: 600,
        resizable: true
    });
    modifiersDialog.render(true);
};
/**
 *
 * @param callback {(includeActorsInGameDirectory: boolean, sceneSelection: 'none' | 'current' | 'all') => void}
 * @param data {{documentType?: 'actor' | 'item'}}
 * @return {Promise<void>}
 */
const reloadTemplates = async (callback, data) => {
    const content = await renderTemplate(`systems/${game.system.id}/templates/_template/dialogs/reloadTemplates.hbs`, {
        ...data,
        type: data.documentType === 'item' ? 'Items' : 'Actors',
        SCENE_SELECTION_OPTIONS: {
            none: 'None',
            current: 'Current',
            all: 'All'
        }
    });
    if (reloadTemplatesDialog && reloadTemplatesDialog.rendered) {
        await reloadTemplatesDialog.close();
    }
    reloadTemplatesDialog = new Dialog({
        title: 'Reload Templates',
        content: content,
        buttons: {
            validate: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize('Save'),
                callback: (html) => {
                    const includeActorsInGameDirectory = html.find('#actorsInGameDirectory')?.is(':checked');
                    const sceneSelection = html.find('#tokensInScenes')?.val();
                    callback(includeActorsInGameDirectory, sceneSelection);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize('Cancel')
            }
        },
        default: 'cancel'
    });
    reloadTemplatesDialog.render(true);
};
export default {
    editTab,
    component,
    attributes,
    attributeBars,
    displaySettings,
    modifiers,
    reloadTemplates
};
