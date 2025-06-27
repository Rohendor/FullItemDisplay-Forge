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
import ExtensibleTable, { TABLE_SORT_OPTION, COMPARISON_OPERATOR, SORT_OPERATORS } from './ExtensibleTable.js';
import { castToPrimitive, fastSetFlag, getLocalizedAlignmentList } from '../../utils.js';
import Formula from '../../formulas/Formula.js';
import { isComputableElement
// isComputableElement
 } from '../../interfaces/ComputableElement.js';
import { isChatSenderElement } from '../../interfaces/ChatSenderElement.js';
import Label from './Label.js';
import Meter from './Meter.js';
/**
 * Class ItemContainer
 * @ignore
 */
class ItemContainer extends ExtensibleTable {
    /**
     * ItemContainer constructor
     */
    constructor(props) {
        super(props);
        this._title = props.title;
        this._hideEmpty = props.hideEmpty;
        this._headDisplay = props.headDisplay;
        this._sortOption = props.sortOption ?? TABLE_SORT_OPTION.MANUAL;
        this._templateFilter = props.templateFilter;
        this._itemFilterFormula = props.itemFilterFormula;
        this._sortPredicates = props.sortPredicates;
        this._showDelete = props.showDelete;
        this._statusIcon = props.statusIcon;
        this._nameAlign = props.nameAlign;
        this._nameLabel = props.nameLabel;
    }
    /**
     * Renders component
     * @override
     * @param entity Rendered entity (actor or item)
     * @param isEditable Is the component editable by the current user ?
     * @param options Additional options usable by the final Component
     * @return The jQuery element holding the component
     */
    async _getElement(entity, isEditable = true, options = {}) {
        const jQElement = await super._getElement(entity, isEditable, options);
        let relevantItems = this.filterItems(entity, options);
        if (!entity.isTemplate) {
            relevantItems = this._sortItems(relevantItems, entity);
            fastSetFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption.savedOrder', relevantItems.map((item) => item.id));
        }
        if (!this._headDisplay && !this._showDelete && this.contents.length === 0 && !entity.isTemplate) {
            jQElement.addClass('flexcol flex-group-no-stretch');
            switch (this._nameAlign) {
                case 'center':
                    jQElement.addClass('flex-group-center');
                    break;
                case 'right':
                    jQElement.addClass('flex-group-right');
                    break;
                case 'left':
                default:
                    jQElement.addClass('flex-group-left');
                    break;
            }
            for (const item of relevantItems) {
                jQElement.append(this._generateItemLink(item));
            }
        }
        else {
            const tableElement = $('<table></table>');
            if (this._hideEmpty && relevantItems.length === 0 && !entity.isTemplate) {
                tableElement.addClass('hidden');
            }
            if (this._title) {
                const captionElement = $('<caption></caption>');
                captionElement.append(this._title);
                tableElement.append(captionElement);
            }
            const tableBody = $('<tbody></tbody>');
            if (this._headDisplay || entity.isTemplate) {
                const firstRow = $('<tr></tr>');
                let columnSortOption = undefined;
                if (this._sortOption === TABLE_SORT_OPTION.MANUAL) {
                    columnSortOption = game.user.getFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption');
                }
                if (!this._headDisplay) {
                    firstRow.addClass('custom-system-hidden-row');
                }
                const cell = $('<td></td>');
                cell.addClass('custom-system-cell ');
                if (this._head) {
                    cell.addClass('custom-system-cell-boldTitle');
                }
                switch (this._nameAlign) {
                    case 'center':
                        cell.addClass('custom-system-cell-alignCenter');
                        break;
                    case 'right':
                        cell.addClass('custom-system-cell-alignRight');
                        break;
                    case 'left':
                    default:
                        cell.addClass('custom-system-cell-alignLeft');
                        break;
                }
                const colNameDiv = $('<div></div>');
                colNameDiv.addClass('custom-system-field custom-system-field-full-size');
                const colNameSpan = $('<span></span>');
                colNameSpan.append(this._nameLabel);
                colNameDiv.append(colNameSpan);
                if (!entity.isTemplate && this._sortOption === TABLE_SORT_OPTION.MANUAL) {
                    colNameDiv.append('&nbsp;');
                    let nextSortIsToAsc = true;
                    if (columnSortOption?.prop === 'name') {
                        nextSortIsToAsc = columnSortOption.operator !== COMPARISON_OPERATOR.LESSER_THAN;
                        colNameDiv.append(`<i class="fas fa-caret-${columnSortOption.operator === COMPARISON_OPERATOR.GREATER_THAN ? 'up' : 'down'}"></i>`);
                    }
                    cell.addClass('custom-system-clickable');
                    cell.on('click', async () => {
                        fastSetFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption', {
                            prop: 'name',
                            operator: nextSortIsToAsc
                                ? COMPARISON_OPERATOR.LESSER_THAN
                                : COMPARISON_OPERATOR.GREATER_THAN
                        });
                        entity.render(false);
                    });
                }
                cell.append(colNameDiv);
                firstRow.append(cell);
                for (const component of this.contents) {
                    const cell = $('<td></td>');
                    cell.addClass('custom-system-cell');
                    switch (this._rowLayout[component.key].align) {
                        case 'center':
                            cell.addClass('custom-system-cell-alignCenter');
                            break;
                        case 'right':
                            cell.addClass('custom-system-cell-alignRight');
                            break;
                        case 'left':
                        default:
                            cell.addClass('custom-system-cell-alignLeft');
                            break;
                    }
                    if (this._head) {
                        cell.addClass('custom-system-cell-boldTitle');
                    }
                    const colNameDiv = $('<div></div>');
                    colNameDiv.addClass('custom-system-field custom-system-field-' + (component.size ?? 'full-size'));
                    if (entity.isTemplate) {
                        const sortLeftTabButton = $('<a><i class="fas fa-caret-left custom-system-clickable"></i></a>');
                        sortLeftTabButton.addClass('item');
                        sortLeftTabButton.attr('title', game.i18n.localize('CSB.ComponentProperties.ExtensibleTable.ColumnSort.SortLeft'));
                        sortLeftTabButton.on('click', () => {
                            component.sortBeforeInParent(entity);
                        });
                        colNameDiv.append(sortLeftTabButton);
                    }
                    const colNameSpan = $('<span></span>');
                    const colName = (this._rowLayout[component.key].colName ?? '') === ''
                        ? '&nbsp;'
                        : this._rowLayout[component.key].colName;
                    colNameSpan.append(colName);
                    if (entity.isTemplate) {
                        colNameSpan.addClass('custom-system-editable-component');
                        colNameSpan.append(' {' + component.key + '}');
                        colNameSpan.on('click', () => {
                            component.editComponent(entity, this._rowLayout[component.key], ItemContainer.ALLOWED_COMPONENTS);
                        });
                    }
                    colNameDiv.append(colNameSpan);
                    if (!entity.isTemplate && this._sortOption === TABLE_SORT_OPTION.MANUAL) {
                        colNameDiv.append('&nbsp;');
                        let nextSortIsToAsc = true;
                        if (columnSortOption && columnSortOption?.prop === component.key) {
                            nextSortIsToAsc = columnSortOption.operator !== COMPARISON_OPERATOR.LESSER_THAN;
                            colNameDiv.append(`<i class="fas fa-caret-${columnSortOption.operator === COMPARISON_OPERATOR.GREATER_THAN ? 'up' : 'down'}"></i>`);
                        }
                        cell.addClass('custom-system-clickable');
                        cell.on('click', async () => {
                            fastSetFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption', {
                                prop: component.key,
                                operator: nextSortIsToAsc
                                    ? COMPARISON_OPERATOR.LESSER_THAN
                                    : COMPARISON_OPERATOR.GREATER_THAN
                            });
                            entity.render(false);
                        });
                    }
                    if (entity.isTemplate) {
                        const sortRightTabButton = $('<a><i class="fas fa-caret-right custom-system-clickable"></i></a>');
                        sortRightTabButton.addClass('item');
                        sortRightTabButton.attr('title', game.i18n.localize('CSB.ComponentProperties.ExtensibleTable.ColumnSort.SortRight'));
                        sortRightTabButton.on('click', () => {
                            component.sortAfterInParent(entity);
                        });
                        colNameDiv.append(sortRightTabButton);
                    }
                    cell.append(colNameDiv);
                    firstRow.append(cell);
                }
                if (this._showDelete || entity.isTemplate) {
                    const headControlsCell = $('<td></td>');
                    if (entity.isTemplate) {
                        headControlsCell.addClass('custom-system-cell custom-system-cell-alignRight');
                        headControlsCell.append(await this.renderTemplateControls(entity, {
                            allowedComponents: ItemContainer.ALLOWED_COMPONENTS
                        }));
                    }
                    firstRow.append(headControlsCell);
                }
                tableBody.append(firstRow);
            }
            for (const [index, item] of relevantItems.entries()) {
                const tableRow = $('<tr></tr>');
                tableRow.addClass('custom-system-dynamicRow');
                const tableCell = $('<td></td>');
                tableCell.addClass('custom-system-cell');
                switch (this._nameAlign) {
                    case 'center':
                        tableCell.addClass('custom-system-cell-alignCenter');
                        break;
                    case 'right':
                        tableCell.addClass('custom-system-cell-alignRight');
                        break;
                    case 'left':
                    default:
                        tableCell.addClass('custom-system-cell-alignLeft');
                        break;
                }
                tableCell.append(this._generateItemLink(item));
                tableRow.append(tableCell);
                for (const component of this.contents) {
                    const cell = $('<td></td>');
                    cell.addClass('custom-system-cell');
                    switch (this._rowLayout[component.key].align) {
                        case 'center':
                            cell.addClass('custom-system-cell-alignCenter');
                            break;
                        case 'right':
                            cell.addClass('custom-system-cell-alignRight');
                            break;
                        case 'left':
                        default:
                            cell.addClass('custom-system-cell-alignLeft');
                            break;
                    }
                    const newCompJson = component.toJSON();
                    newCompJson.key = `${this._key}.${item.id}.${component.key}`;
                    const itemProps = {
                        ...item.system.props,
                        name: item.name
                    };
                    cell.append(await componentFactory.createOneComponent(newCompJson).render(entity, isEditable, {
                        ...options,
                        customProps: { ...options.customProps, item: itemProps },
                        linkedEntity: item,
                        reference: `${this.key}.${item.id}`
                    }));
                    tableRow.append(cell);
                }
                if (this._showDelete || this._sortOption === TABLE_SORT_OPTION.MANUAL) {
                    const controlCell = $('<td></td>');
                    const controlDiv = $('<div></div>');
                    controlDiv.addClass('custom-system-dynamic-table-row-icons');
                    if (isEditable && !entity.isTemplate) {
                        if (this._sortOption === TABLE_SORT_OPTION.MANUAL) {
                            const sortSpan = $('<span></span>');
                            sortSpan.addClass('custom-system-dynamic-table-sort-icon-wrapper');
                            if (item !== relevantItems[0]) {
                                const sortUpLink = $('<a class="custom-system-sortUpDynamicLine custom-system-clickable"><i class="fas fa-sort-up custom-system-dynamic-table-sort-icon"></i></a>');
                                sortSpan.append(sortUpLink);
                                sortUpLink.on('click', () => {
                                    this._swapItemElements(entity, index - 1, index);
                                });
                            }
                            if (item !== relevantItems[relevantItems.length - 1]) {
                                const sortDownLink = $('<a class="custom-system-sortDownDynamicLine custom-system-clickable"><i class="fas fa-sort-down custom-system-dynamic-table-sort-icon"></i></a>');
                                sortSpan.append(sortDownLink);
                                sortDownLink.on('click', () => {
                                    this._swapItemElements(entity, index + 1, index);
                                });
                            }
                            controlDiv.append(sortSpan);
                        }
                        if (this._showDelete) {
                            const deleteLink = $('<a><i class="fas fa-trash custom-system-deleteDynamicLine custom-system-clickable"></i></a>');
                            const deleteItem = async () => {
                                if (!item.id) {
                                    return;
                                }
                                await item.delete();
                                entity.render(false);
                            };
                            if (this._deleteWarning) {
                                deleteLink.on('click', async () => {
                                    await Dialog.confirm({
                                        title: game.i18n.localize('CSB.ComponentProperties.ItemContainer.DeleteItemDialog.Title'),
                                        content: `<p>${game.i18n.localize('CSB.ComponentProperties.ItemContainer.DeleteItemDialog.Content')}</p>`,
                                        yes: deleteItem,
                                        no: () => { }
                                    });
                                });
                            }
                            else {
                                deleteLink.on('click', deleteItem);
                            }
                            controlDiv.append(deleteLink);
                        }
                    }
                    controlCell.append(controlDiv);
                    tableRow.append(controlCell);
                }
                tableBody.append(tableRow);
            }
            tableElement.append(tableBody);
            jQElement.append(tableElement);
        }
        return jQElement;
    }
    getComputeFunctions(entity, modifiers, options, keyOverride) {
        const computationKey = keyOverride ?? this.key;
        const computableFields = this.contents.filter((component) => isComputableElement(component));
        let computationFunctions = {};
        const relevantItems = this.filterItems(entity, options);
        for (const item of relevantItems) {
            computationFunctions[`${computationKey}.${item.id}.name`] = { formula: item.name ?? '' };
            computationFunctions[`${computationKey}.${item.id}.id`] = { formula: item.id };
            computationFunctions[`${computationKey}.${item.id}.uuid`] = { formula: item.uuid };
            const itemProps = item.system.props;
            itemProps.name = item.name;
            for (const computableElement of computableFields) {
                const newFormulas = computableElement.getComputeFunctions(entity, modifiers, {
                    ...options,
                    reference: `${computationKey}.${item.id}`,
                    customProps: { ...options?.customProps, item: itemProps },
                    linkedEntity: item
                }, `${computationKey}.${item.id}.${computableElement.key}`);
                computationFunctions = {
                    ...computationFunctions,
                    ...newFormulas
                };
            }
        }
        return computationFunctions;
    }
    resetComputeValue(valueKeys, entity) {
        const resetValues = {};
        for (const key of valueKeys) {
            foundry.utils.setProperty(resetValues, key, undefined);
        }
        const existingRows = foundry.utils.getProperty(entity.system.props, this.key);
        for (const existingKey in existingRows) {
            const buildKey = `${this.key}.${existingKey}`;
            if (!valueKeys.some((key) => key.startsWith(buildKey))) {
                foundry.utils.setProperty(resetValues, buildKey, null);
            }
        }
        return resetValues;
    }
    getSendToChatFunctions(entity, options = {}) {
        if (!this.key) {
            return {};
        }
        const relevantFields = this.contents.filter((component) => isChatSenderElement(component));
        const relevantItems = this.filterItems(entity, options);
        const res = {};
        for (const item of relevantItems) {
            res[item.id] = {};
            for (const chatSenderElement of relevantFields) {
                foundry.utils.mergeObject(res[item.id], chatSenderElement.getSendToChatFunctions(entity, {
                    ...options,
                    reference: `${this.key}.${item.id}`,
                    linkedEntity: item
                }));
            }
        }
        return {
            [this.key]: res
        };
    }
    /**
     * Returns serialized component
     * @override
     */
    toJSON() {
        const jsonObj = super.toJSON();
        return {
            ...jsonObj,
            title: this._title,
            hideEmpty: this._hideEmpty,
            sortOption: this._sortOption,
            headDisplay: this._headDisplay,
            showDelete: this._showDelete,
            statusIcon: this._statusIcon,
            nameAlign: this._nameAlign,
            nameLabel: this._nameLabel,
            templateFilter: this._templateFilter,
            itemFilterFormula: this._itemFilterFormula,
            sortPredicates: this._sortPredicates
        };
    }
    /**
     * Creates checkbox from JSON description
     * @override
     */
    static fromJSON(json, templateAddress, parent) {
        const rowContents = [];
        const rowLayout = {};
        const itemContainer = new ItemContainer({
            key: json.key,
            tooltip: json.tooltip,
            templateAddress: templateAddress,
            cssClass: json.cssClass,
            title: json.title,
            hideEmpty: json.hideEmpty,
            head: json.head,
            sortOption: json.sortOption,
            headDisplay: json.headDisplay,
            showDelete: json.showDelete,
            deleteWarning: json.deleteWarning,
            statusIcon: json.statusIcon,
            nameAlign: json.nameAlign,
            nameLabel: json.nameLabel,
            templateFilter: json.templateFilter,
            itemFilterFormula: json.itemFilterFormula,
            sortPredicates: json.sortPredicates,
            contents: rowContents,
            rowLayout: rowLayout,
            role: json.role,
            permission: json.permission,
            visibilityFormula: json.visibilityFormula,
            parent: parent
        });
        for (const [index, componentDesc] of (json.rowLayout ?? []).entries()) {
            const component = componentFactory.createOneComponent(componentDesc, templateAddress + '-rowLayout-' + index, itemContainer);
            rowContents.push(component);
            rowLayout[component.key] = {
                align: componentDesc.align,
                colName: componentDesc.colName
            };
        }
        return itemContainer;
    }
    /**
     * Gets technical name for this component's type
     * @return The technical name
     * @throws {Error} If not implemented
     */
    static getTechnicalName() {
        return 'itemContainer';
    }
    /**
     * Gets pretty name for this component's type
     * @return The pretty name
     * @throws {Error} If not implemented
     */
    static getPrettyName() {
        return game.i18n.localize('CSB.ComponentProperties.ComponentType.ItemContainer');
    }
    /**
     * Get configuration form for component creation / edition
     * @return The jQuery element holding the configuration form
     */
    static async getConfigForm(existingComponent, _entity) {
        const predefinedValuesComponent = { ...existingComponent };
        predefinedValuesComponent.headDisplay = predefinedValuesComponent.headDisplay ?? true;
        predefinedValuesComponent.showDelete = predefinedValuesComponent.showDelete ?? true;
        predefinedValuesComponent.nameLabel =
            predefinedValuesComponent.nameLabel ??
                game.i18n.localize('CSB.ComponentProperties.ItemContainer.ItemRefColLabelDefault');
        predefinedValuesComponent.sortOption = predefinedValuesComponent.sortOption ?? TABLE_SORT_OPTION.MANUAL;
        predefinedValuesComponent.itemFilterFormula = predefinedValuesComponent.itemFilterFormula ?? '';
        predefinedValuesComponent.availableTemplates = (game.items?.filter((item) => item.type === '_equippableItemTemplate')).map((template) => ({
            id: template.id,
            name: template.name,
            checked: existingComponent?.templateFilter?.includes(template.id)
        }));
        const mainElt = $('<div></div>');
        mainElt.append(await renderTemplate('systems/' + game.system.id + '/templates/_template/components/itemContainer.hbs', {
            ...predefinedValuesComponent,
            ALIGNMENTS: getLocalizedAlignmentList(),
            SORT_OPERATORS
        }));
        return mainElt;
    }
    /**
     * Attaches event-listeners to the html of the config-form
     */
    static attachListenersToConfigForm(html) {
        $(html)
            .find("input[name='containerSortOption']")
            .on('click', (event) => {
            const targetValue = $(event.currentTarget).val();
            const autoSort = $(html).find('.custom-system-sort-auto');
            const manualSort = $(html).find('.custom-system-sort-manual');
            const disabledSort = $(html).find('.custom-system-sort-disabled');
            const slideValue = 200;
            autoSort.slideUp(slideValue);
            manualSort.slideUp(slideValue);
            disabledSort.slideUp(slideValue);
            switch (targetValue) {
                case 'auto':
                    autoSort.slideDown(slideValue);
                    break;
                case 'manual':
                    manualSort.slideDown(slideValue);
                    break;
                case 'disabled':
                    disabledSort.slideDown(slideValue);
                    break;
            }
        });
        $(html)
            .find('#custom-system-add-sort-predicate')
            .on('click', () => {
            const newId = $(html).find('#custom-system-sort-predicates select').length;
            const newRow = $(html).find('#custom-system-sort-predicate-template')[0].content.cloneNode(true);
            $(newRow)
                .find('select')
                .each((_i, elt) => {
                $(elt).attr('id', `${elt.name}_${newId}`);
            });
            $(html)
                .find('#custom-system-sort-predicates > tbody')
                .append(newRow);
        });
        $(html)
            .find('#custom-system-sort-predicates')
            .on('click', '.custom-system-delete-sort-predicate', (ev) => {
            const target = $(ev.currentTarget);
            target.parents('tr').remove();
        });
    }
    /**
     * Extracts configuration from submitted HTML form
     * @override
     * @param html The submitted form
     * @return The JSON representation of the component
     * @throws {Error} If configuration is not correct
     */
    static extractConfig(html) {
        const fieldData = super.extractConfig(html);
        fieldData.title = html.find('#itemTitle').val()?.toString() ?? '';
        fieldData.hideEmpty = html.find('#itemHideEmpty').is(':checked');
        fieldData.headDisplay = html.find('#itemHeadDisplay').is(':checked');
        fieldData.head = html.find('#itemHead').is(':checked');
        fieldData.showDelete = html.find('#itemShowDelete').is(':checked');
        fieldData.deleteWarning = html.find('#itemDeleteWarning').is(':checked');
        fieldData.statusIcon = html.find('#itemStatusIcon').is(':checked');
        fieldData.nameAlign = html.find('#itemNameAlign').val()?.toString() ?? 'left';
        fieldData.nameLabel = html.find('#itemNameLabel').val()?.toString() ?? '';
        fieldData.sortOption = html.find('input[name=containerSortOption]:checked').val();
        fieldData.itemFilterFormula = html.find('#itemFilterFormula').val()?.toString() ?? '';
        fieldData.templateFilter = html
            .find('input[name=itemFilterTemplate]:checked')
            .map(function () {
            return $(this).val()?.toString();
        })
            .get();
        if (fieldData.sortOption === TABLE_SORT_OPTION.AUTO) {
            fieldData.sortPredicates = this._fetchDataFromHTMLTable(html, 'custom-system-sort-predicate', new Map([
                [
                    'prop',
                    {
                        element: 'input[name=sortProp]',
                        name: game.i18n.localize('CSB.ComponentProperties.ExtensibleTable.Sort.ColumnKey')
                    }
                ],
                [
                    'operator',
                    {
                        element: 'select[name=sortOp]',
                        name: game.i18n.localize('CSB.ComponentProperties.ExtensibleTable.Sort.Operator')
                    }
                ],
                [
                    'value',
                    {
                        element: 'input[name=sortValue]',
                        optional: true,
                        name: game.i18n.localize('CSB.ComponentProperties.ExtensibleTable.Sort.Value')
                    }
                ]
            ]));
        }
        else {
            fieldData.sortPredicates = [];
        }
        return fieldData;
    }
    /**
     * Filters items by template and itemFilters
     */
    filterItems(entity, options) {
        return entity.items.filter((item) => {
            if (item.type !== 'equippableItem') {
                return false;
            }
            if (!item.system.template ||
                (this._templateFilter.length > 0 && !this._templateFilter.includes(item.system.template))) {
                return false;
            }
            if (!this._itemFilterFormula) {
                return true;
            }
            return !!castToPrimitive(new Formula(this._itemFilterFormula).computeStatic({
                ...entity.system.props,
                item: item.system.props
            }, {
                ...options,
                source: `${this.key}.${item.name}.filter`
            }).result);
        });
    }
    /**
     * Sorts an array of items based on sort predicates
     */
    _sortItems(items, entity) {
        let sortPredicates;
        let columnSortOption = undefined;
        // Get all properties
        const itemContainerProps = foundry.utils.getProperty(entity.system.props, this.key);
        switch (this._sortOption) {
            case TABLE_SORT_OPTION.AUTO:
                sortPredicates = this._sortPredicates.map((predicate) => ({ ...predicate })).reverse();
                sortPredicates.forEach((predicate) => {
                    items.sort((a, b) => {
                        const targetValue = castToPrimitive(predicate.value);
                        let aValue, bValue;
                        // If predicate property exists in the columns, we sort on column value
                        if (this.contents.find((component) => component.key === predicate.prop)) {
                            aValue = castToPrimitive(itemContainerProps[a.id][predicate.prop]);
                            bValue = castToPrimitive(itemContainerProps[b.id][predicate.prop]);
                        }
                        else {
                            // Else we sort on item property value
                            aValue = castToPrimitive(a.system.props[predicate.prop]);
                            bValue = castToPrimitive(b.system.props[predicate.prop]);
                        }
                        return ItemContainer.getSortOrder(aValue ?? '', bValue ?? '', targetValue, predicate.operator);
                    });
                });
                break;
            case TABLE_SORT_OPTION.MANUAL:
                columnSortOption = game.user.getFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption');
                if (columnSortOption?.prop) {
                    if (itemContainerProps) {
                        items.sort((a, b) => {
                            const aValue = castToPrimitive(itemContainerProps[a.id][columnSortOption.prop]) ?? '';
                            const bValue = castToPrimitive(itemContainerProps[b.id][columnSortOption.prop]) ?? '';
                            return ItemContainer.getSortOrder(aValue, bValue, undefined, columnSortOption.operator);
                        });
                    }
                }
                else {
                    const itemOrder = this._synchronizeItemIdsWithItemOrder(items.map((item) => item.id), columnSortOption?.savedOrder ?? []);
                    items.sort((a, b) => {
                        const indexA = itemOrder.indexOf(a.id);
                        const indexB = itemOrder.indexOf(b.id);
                        return indexA === -1 ? 1 : indexB === -1 ? -1 : indexA - indexB;
                    });
                }
                break;
            case TABLE_SORT_OPTION.DISABLED:
            default:
                break;
        }
        return items;
    }
    /**
     * Synchronizes item-ids with itemOrder (adds and removes entries from itemOrder)
     * @param itemIds Existing ids
     * @param itemOrder Existing order to filter
     * @return The updated order
     */
    _synchronizeItemIdsWithItemOrder(itemIds, itemOrder) {
        //Remove item-ids, which are not present anymore
        itemOrder = itemOrder.filter((id) => itemIds.includes(id));
        //Add new item-ids to itemOrder
        itemIds.forEach((id) => {
            if (!itemOrder.includes(id)) {
                itemOrder.push(id);
            }
        });
        return itemOrder;
    }
    /**
     * Generates the element to display the item link in the Container
     * @param item The item to render
     */
    _generateItemLink(item) {
        const itemBox = $('<span></span>');
        const itemLink = $('<a></a>');
        itemLink.addClass('content-link');
        itemLink.attr({
            'data-type': 'Item',
            'data-entity': 'Item',
            'data-id': item.id,
            'data-uuid': item.uuid,
            'data-tooltip': item.name ?? 'Item',
            'data-link': '',
            'data-scope': '',
            draggable: 'true'
        });
        const itemImg = $('<img></img>');
        itemImg.attr({
            src: item.img,
            alt: `${item.name ?? 'Item'} image`,
            draggable: 'false'
        });
        itemImg.addClass('custom-system-item-container-image');
        itemLink.append(itemImg);
        itemLink.append(item.name ?? '');
        itemLink.on('click', () => {
            item.sheet?.render(true);
        });
        if (game.user.isGM && this._statusIcon) {
            const templateLink = $('<i class="fa-solid"></i>');
            templateLink.css({ 'margin-right': '4px' });
            const templateItem = game.items?.get(item.system.template ?? '');
            if (!templateItem) {
                templateLink.addClass('fa-exclamation-triangle');
                templateLink.css({ color: 'rgba(214, 150, 0, 0.8)' });
            }
            else {
                templateLink.addClass('fa-circle-check');
                templateLink.css({ color: 'rgba(26, 107, 34, 0.8)', cursor: 'pointer' });
                templateLink.on('click', () => {
                    templateItem.sheet?.render(true);
                });
            }
            itemBox.append(templateLink);
        }
        itemBox.append(itemLink);
        return itemBox;
    }
    /**
     * Swaps two item elements
     * @param entity Rendered entity (actor or item)
     * @param index1
     * @param index2
     * @override
     */
    _swapItemElements(entity, index1, index2) {
        const savedOrder = game.user.getFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption.savedOrder');
        const temp = savedOrder[index1];
        savedOrder[index1] = savedOrder[index2];
        savedOrder[index2] = temp;
        fastSetFlag(game.system.id, entity.uuid + '.' + this.templateAddress + '.sortOption', {
            ['-=prop']: true,
            ['-=operator']: true,
            savedOrder
        });
        entity.render(false);
    }
    /**
     * Fetches data from an HTML-Table
     * @throws {Error} If configuration is not correct
     */
    static _fetchDataFromHTMLTable(html, tableRowClass, tableProperties) {
        const collection = [];
        html.find(`tr.${tableRowClass}`).each((_index, elt) => {
            const rowData = {};
            tableProperties.forEach((value, key) => {
                let input = $(elt).find(value.element).val();
                if (!value.optional && !input) {
                    throw new Error(game.i18n.format('CSB.ComponentProperties.Errors.DynamicTableAutoFilterValidationError', {
                        KEY: value.name
                    }));
                }
                if (Array.isArray(input)) {
                    input = input.join();
                }
                rowData[key] = String(input);
            });
            collection.push(rowData);
        });
        return collection;
    }
    /**
     * Add a new Component as eligible for this Container
     *
     * @param name The technical name which identifies the component in the ComponentFactory
     */
    static addAllowedComponent(name) {
        this.ALLOWED_COMPONENTS.push(name);
    }
}
ItemContainer.ALLOWED_COMPONENTS = [Label.getTechnicalName(), Meter.getTechnicalName()];
/**
 * @ignore
 */
export default ItemContainer;
