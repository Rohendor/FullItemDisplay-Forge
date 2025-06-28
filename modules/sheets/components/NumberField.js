/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import Logger from '../../Logger.js';
import InputComponent, { COMPONENT_SIZES } from './InputComponent.js';
import { RequiredFieldError } from '../../errors/ComponentValidationError.js';
export const NUMBER_FIELD_INPUT_STYLES = {
    text: 'CSB.ComponentProperties.NumberField.DisplayStyle.DisplayAsTextField',
    range: 'CSB.ComponentProperties.NumberField.DisplayStyle.DisplayAsSlider'
};
const defaultInputStyle = 'text';
export const NUMBER_FIELD_CONTROLS_STYLES = {
    hover: 'CSB.ComponentProperties.NumberField.ControlStyle.Hover',
    full: 'CSB.ComponentProperties.NumberField.ControlStyle.FullControl'
};
const defaultControlsStyle = 'hover';
/**
 * NumberField component
 * @ignore
 */
class NumberField extends InputComponent {
    /**
     * Text field constructor
     */
    constructor(props) {
        super(props);
        this._allowDecimal = props.allowDecimal;
        this._minVal = props.minVal;
        this._maxVal = props.maxVal;
        this._allowRelative = props.allowRelative;
        this._showControls = props.showControls;
        this._controlsStyle = props.controlsStyle ?? defaultControlsStyle;
        this._inputStyle = props.inputStyle ?? defaultInputStyle;
    }
    /**
     * Compute the max value of this Number Field
     * @param entity Entity computing the max value
     * @param options Options to alter computation
     * @param keyOverride Override the source key to the computation
     * @returns The max value
     */
    getMaxValue(entity, options, keyOverride) {
        return this._getMaxVal(entity, entity.system.props, { ...options, source: keyOverride ?? this.key });
    }
    /**
     * Compute the value of this Number Field
     * @param entity Entity computing the value
     * @param _options Ignored
     * @param keyOverride Override the source key to the computation
     * @returns The value
     */
    getValue(entity, _options, keyOverride) {
        return Number(entity.system.props[keyOverride ?? this.key]);
    }
    /**
     * @inheritdoc
     */
    isEditable() {
        return true;
    }
    _getMinVal(entity, props, options) {
        let min = -Infinity;
        if (this._minVal) {
            min = Number(this._minVal);
            if (Number.isNaN(min)) {
                min = Number(ComputablePhrase.computeMessageStatic(this._minVal, props, {
                    source: `${options?.source ?? this.key}.min`,
                    reference: options?.reference,
                    defaultValue: '0',
                    triggerEntity: entity
                }).result);
            }
            if (Number.isNaN(min)) {
                min = -Infinity;
            }
        }
        return min;
    }
    _getMaxVal(entity, props, options) {
        let max = Infinity;
        if (this._maxVal) {
            max = Number(this._maxVal);
            if (Number.isNaN(max)) {
                max = Number(ComputablePhrase.computeMessageStatic(this._maxVal, props, {
                    source: `${options?.source ?? this.key}.max`,
                    reference: options?.reference,
                    defaultValue: '0',
                    triggerEntity: entity
                }).result);
            }
            if (Number.isNaN(max)) {
                max = Infinity;
            }
        }
        return max;
    }
    /**
     * Renders component
     * @override
     * @return The jQuery element holding the component
     */
    async _getElement(entity, isEditable = true, options = {}) {
        const { reference } = options;
        const props = { ...entity.system.props, ...options.customProps };
        const jQElement = await super._getElement(entity, isEditable, options);
        jQElement.addClass('custom-system-number-field');
        const fieldSpan = $('<span></span>');
        fieldSpan.addClass('custom-system-number-input-span');
        const hiddenInputElement = $('<input />');
        hiddenInputElement.attr('type', 'hidden');
        if (options.changeCallback) {
            hiddenInputElement.on('change', options.changeCallback);
        }
        if (!entity.isTemplate && !options.noName) {
            hiddenInputElement.attr('name', 'system.props.' + this.key);
        }
        const inputElement = $('<input />');
        inputElement.attr('type', this._inputStyle);
        if (this._inputStyle === 'range') {
            inputElement.attr('min', this._getMinVal(entity, props, options));
            inputElement.attr('max', this._getMaxVal(entity, props, options));
        }
        inputElement.attr('id', `${entity.uuid}-${this.key}`);
        if (!isEditable) {
            hiddenInputElement.attr('disabled', 'disabled');
            inputElement.attr('disabled', 'disabled');
        }
        const fieldValue = options.overrideValue ??
            foundry.utils.getProperty(props, this.key) ??
            (this.defaultValue
                ? Number(ComputablePhrase.computeMessageStatic(this.defaultValue, props, {
                    source: `${this.key}.defaultValue`,
                    reference,
                    defaultValue: '',
                    triggerEntity: entity
                }).result)
                : '');
        hiddenInputElement.val(fieldValue);
        inputElement.val(fieldValue);
        const persistValue = () => {
            let newValue = String(inputElement.val());
            const oldValue = String(hiddenInputElement.val());
            let persistedValue;
            if (isNaN(Number(newValue))) {
                persistedValue = Number(oldValue);
                ui.notifications.warn(game.i18n.localize('CSB.UserMessages.NumberField.ValueNotNumeric'));
            }
            else {
                if (!this._allowDecimal && !Number.isInteger(Number(newValue))) {
                    newValue = oldValue;
                    ui.notifications.warn(game.i18n.localize('CSB.UserMessages.NumberField.ValueNotInteger'));
                }
                persistedValue = Number(newValue);
                if (this._allowRelative && (newValue.startsWith('+') || newValue.startsWith('-'))) {
                    persistedValue = Number(oldValue) + Number(newValue);
                }
                const min = this._getMinVal(entity, props, options);
                if (persistedValue < min) {
                    persistedValue = min;
                    ui.notifications.warn(game.i18n.format('CSB.UserMessages.NumberField.ValueNotTooLow', { VALUE: min }));
                }
                const max = this._getMaxVal(entity, props, options);
                if (persistedValue > max) {
                    persistedValue = max;
                    ui.notifications.warn(game.i18n.format('CSB.UserMessages.NumberField.ValueNotTooHigh', { VALUE: max }));
                }
            }
            inputElement.val(persistedValue);
            if (String(persistedValue) !== oldValue) {
                Logger.debug('Saving value ' + persistedValue);
                hiddenInputElement.attr('value', persistedValue).trigger('change');
            }
        };
        if (!entity.isTemplate) {
            if (!isEditable) {
                jQElement.append(inputElement);
            }
            else {
                let hasBeenModified = false;
                inputElement
                    .on('focus', () => {
                    inputElement.trigger('select');
                })
                    .on('keydown', () => {
                    if (inputElement.val() !== fieldValue) {
                        hasBeenModified = true;
                    }
                })
                    .on('blur', () => {
                    if (hasBeenModified) {
                        persistValue();
                    }
                })
                    .on('change', (event) => {
                    persistValue();
                    event.preventDefault();
                    event.stopPropagation();
                });
                if (this._showControls) {
                    if (this._controlsStyle === 'full') {
                        fieldSpan.addClass('custom-system-number-input-span-full-controls');
                        const minusTenButton = $('<button type="button"></button >');
                        minusTenButton.text('-10');
                        minusTenButton.addClass('custom-system-number-field-control');
                        minusTenButton.on('click', () => {
                            inputElement.val(Math.max(Number(inputElement.val()) - 10, this._getMinVal(entity, props, options)));
                        });
                        const minusButton = $('<button type="button"></button >');
                        minusButton.text('-1');
                        minusButton.addClass('custom-system-number-field-control');
                        minusButton.on('click', () => {
                            inputElement.val(Math.max(Number(inputElement.val()) - 1, this._getMinVal(entity, props, options)));
                        });
                        const plusButton = $('<button type="button"></button >');
                        plusButton.text('+1');
                        plusButton.addClass('custom-system-number-field-control');
                        plusButton.on('click', () => {
                            inputElement.val(Math.min(Number(inputElement.val()) + 1, this._getMaxVal(entity, props, options)));
                        });
                        const plusTenButton = $('<button type="button"></button >');
                        plusTenButton.text('+10');
                        plusTenButton.addClass('custom-system-number-field-control');
                        plusTenButton.on('click', () => {
                            inputElement.val(Math.min(Number(inputElement.val()) + 10, this._getMaxVal(entity, props, options)));
                        });
                        fieldSpan.append(minusTenButton);
                        fieldSpan.append(minusButton);
                        fieldSpan.append(hiddenInputElement);
                        fieldSpan.append(inputElement);
                        fieldSpan.append(plusButton);
                        fieldSpan.append(plusTenButton);
                        fieldSpan.on('mouseleave', () => {
                            if (!inputElement.is(':focus')) {
                                persistValue();
                            }
                        });
                        jQElement.append(fieldSpan);
                    }
                    else {
                        const minusButton = $('<button type="button"></button >');
                        minusButton.append('<i class="fa fa-minus"></i>');
                        minusButton.addClass('custom-system-number-field-control custom-system-number-field-control-minus');
                        minusButton.on('click', () => {
                            inputElement.val(Math.max(Number(inputElement.val()) - 1, this._getMinVal(entity, props, options)));
                        });
                        minusButton.hide();
                        const plusButton = $('<button type="button"></button >');
                        plusButton.append('<i class="fa fa-plus"></i>');
                        plusButton.addClass('custom-system-number-field-control custom-system-number-field-control-plus');
                        plusButton.on('click', () => {
                            inputElement.val(Math.min(Number(inputElement.val()) + 1, this._getMaxVal(entity, props, options)));
                        });
                        plusButton.hide();
                        fieldSpan.append(minusButton);
                        fieldSpan.append(hiddenInputElement);
                        fieldSpan.append(inputElement);
                        fieldSpan.append(plusButton);
                        fieldSpan
                            .on('mouseover', () => {
                            if ((inputElement.width() ?? 0) < 60) {
                                minusButton.addClass('custom-system-number-field-control-outer');
                                plusButton.addClass('custom-system-number-field-control-outer');
                            }
                            else {
                                minusButton.removeClass('custom-system-number-field-control-outer');
                                plusButton.removeClass('custom-system-number-field-control-outer');
                            }
                            minusButton.show();
                            plusButton.show();
                        })
                            .on('mouseleave', () => {
                            minusButton.hide();
                            plusButton.hide();
                            if (!inputElement.is(':focus')) {
                                persistValue();
                            }
                        });
                        jQElement.append(fieldSpan);
                    }
                }
                else {
                    jQElement.append(inputElement);
                    jQElement.append(hiddenInputElement);
                }
            }
        }
        if (entity.isTemplate) {
            jQElement.addClass('custom-system-editable-component');
            inputElement.addClass('custom-system-editable-field');
            jQElement.on('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.editComponent(entity);
            });
            jQElement.append(inputElement);
        }
        return jQElement;
    }
    /**
     * Returns serialized component
     * @override
     */
    toJSON() {
        const jsonObj = super.toJSON();
        return {
            ...jsonObj,
            allowDecimal: this._allowDecimal,
            minVal: this._minVal,
            maxVal: this._maxVal,
            allowRelative: this._allowRelative,
            showControls: this._showControls,
            controlsStyle: this._controlsStyle,
            inputStyle: this._inputStyle
        };
    }
    /**
     * Creates TextField from JSON description
     * @override
     */
    static fromJSON(json, templateAddress, parent) {
        return new NumberField({
            key: json.key,
            tooltip: json.tooltip,
            templateAddress: templateAddress,
            allowDecimal: json.allowDecimal,
            minVal: json.minVal,
            maxVal: json.maxVal,
            allowRelative: json.allowRelative,
            showControls: json.showControls,
            controlsStyle: json.controlsStyle,
            inputStyle: json.inputStyle,
            label: json.label,
            defaultValue: json.defaultValue,
            size: json.size,
            customSize: json.customSize,
            cssClass: json.cssClass,
            role: json.role,
            permission: json.permission,
            visibilityFormula: json.visibilityFormula,
            parent: parent
        });
    }
    /**
     * Gets technical name for this component's type
     * @return The technical name
     * @throws {Error} If not implemented
     */
    static getTechnicalName() {
        return 'numberField';
    }
    /**
     * Gets pretty name for this component's type
     * @return The pretty name
     * @throws {Error} If not implemented
     */
    static getPrettyName() {
        return game.i18n.localize('CSB.ComponentProperties.ComponentType.NumberField');
    }
    /**
     * Get configuration form for component creation / edition
     * @return The jQuery element holding the component
     */
    static async getConfigForm(existingComponent, _entity) {
        const mainElt = $('<div></div>');
        mainElt.append(await renderTemplate(`systems/${game.system.id}/templates/_template/components/numberField.hbs`, {
            ...existingComponent,
            COMPONENT_SIZES,
            NUMBER_FIELD_CONTROLS_STYLES,
            NUMBER_FIELD_INPUT_STYLES
        }));
        return mainElt;
    }
    /** Attaches event-listeners to the html of the config-form */
    static attachListenersToConfigForm(html) {
        $(html)
            .find('#numberFieldSize')
            .on('change', (event) => {
            const target = $(event.currentTarget);
            const customSizeBlock = $('.custom-system-size-custom');
            const slideValue = 200;
            switch (target.val()) {
                case 'custom':
                    customSizeBlock.slideDown(slideValue);
                    break;
                default:
                    customSizeBlock.slideUp(slideValue);
                    break;
            }
        });
    }
    /**
     * Extracts configuration from submitted HTML form
     * @override
     * @return The JSON representation of the component
     * @throws {Error} If configuration is not correct
     */
    static extractConfig(html) {
        const fieldData = {
            ...super.extractConfig(html),
            label: html.find('#numberFieldLabel').val()?.toString() ?? '',
            defaultValue: html.find('#numberFieldValue').val()?.toString() ?? '',
            size: html.find('#numberFieldSize').val()?.toString() ?? 'full-size',
            allowDecimal: html.find('#numberFieldAllowDecimal').is(':checked'),
            minVal: html.find('#numberFieldMinVal').val()?.toString() ?? '',
            maxVal: html.find('#numberFieldMaxVal').val()?.toString() ?? '',
            allowRelative: html.find('#numberFieldAllowRelative').is(':checked'),
            showControls: html.find('#numberFieldShowControls').is(':checked'),
            controlsStyle: html.find('#numberFieldControlsStyle').val()?.toString() ?? defaultControlsStyle,
            inputStyle: html.find('#numberFieldInputStyle').val()?.toString() ?? defaultInputStyle
        };
        if (fieldData.size === 'custom') {
            fieldData.customSize = parseInt(String(html.find('#numberFieldCustomSize').val()));
        }
        this.validateConfig(fieldData);
        return fieldData;
    }
    static validateConfig(json) {
        super.validateConfig(json);
        if (!json.key) {
            throw new RequiredFieldError(game.i18n.localize('CSB.ComponentProperties.ComponentKey'), json);
        }
    }
}
NumberField.valueType = 'number';
/**
 * @ignore
 */
export default NumberField;
