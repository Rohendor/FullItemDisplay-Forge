/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import TemplateSystem from './templateSystem.js';
import CustomActiveEffect from './activeEffect.js';
/**
 * Extend the base Actor document
 * @extends {Actor}
 */
export class CustomActor extends Actor {
    /**
     * Is this actor a Template?
     * @return {boolean}
     */
    get isTemplate() {
        return this.type === '_template';
    }
    /**
     * Is this actor a Template?
     * @return {boolean}
     */
    get isAssignableTemplate() {
        return this.type === '_template';
    }
    /**
     * Template system in charge of generic templating handling
     * @return {TemplateSystem}
     */
    get templateSystem() {
        if (!this._templateSystem) {
            this._templateSystem = new TemplateSystem(this);
        }
        return this._templateSystem;
    }
    getItems() {
        return new Collection(this.items
            .filter((item) => item.system.container === null || item.system.container === undefined)
            .map((item) => [item.id, item]));
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
        }
    }
    async toggleStatusEffect(statusId, { active, overlay } = { active: false, overlay: false }) {
        const status = CONFIG.statusEffects.find((e) => e.id === statusId);
        if (!status)
            throw new Error(`Invalid status ID "${statusId}" provided to Actor#toggleStatusEffect`);
        const existing = [];
        for (const effect of this.effects) {
            //@ts-expect-error Outdated types
            const statuses = effect.statuses;
            if (statuses.size === 1 && statuses.has(status.id) && effect.id)
                existing.push(effect);
        }
        // Remove the existing effects unless the status effect is forced active
        if (existing.length) {
            if (active)
                return true;
            CustomActiveEffect.removeActiveEffects(this, existing);
            return false;
        }
        // Create a new effect unless the status effect is forced inactive
        if (!active && active !== undefined)
            return;
        //@ts-expect-error Outdated types
        const effect = await ActiveEffect.implementation.fromStatusEffect(statusId);
        if (overlay)
            effect.updateSource({ 'flags.core.overlay': true });
        if (effect.getFlag(game.system.id, 'isPredefined')) {
            return CustomActiveEffect.addActiveEffect(this, effect.id);
        }
        else {
            //@ts-expect-error Outdated types
            return ActiveEffect.implementation.create(effect, { parent: this, keepId: true });
        }
    }
    /**
     * Get all ActiveEffects that are created on this Item.
     * @yields {ActiveEffect}
     * @returns {Generator<ActiveEffect, void, void>}
     */
    *allApplicableEffects({ excludeExternal = false, _excludeTransfer = true } = {}) {
        for (const effect of this.effects) {
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
    /**
     * @override
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
     * @param {string} json
     * @inheritDoc
     * @ignore
     */
    async importFromJSON(json) {
        const res = super.importFromJSON(json);
        await this.update({
            system: {
                templateSystemUniqueVersion: (Math.random() * 0x100000000) >>> 0
            }
        });
        return res;
    }
    /**
     * @override
     * @inheritDoc
     * @ignore
     */
    prepareDerivedData() {
        this.templateSystem.prepareData();
    }
    /**
     * @override
     * @inheritDoc
     * @ignore
     */
    getRollData() {
        // Prepare character roll data.
        const data = super.getRollData();
        return this.templateSystem.getRollData(data);
    }
    /**
     * Handle how changes to a Token attribute bar are applied to the Actor.
     * @param {string} attribute    The attribute path
     * @param {number} value        The target attribute value
     * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
     * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
     * @returns {Promise<documents.Actor>}  The updated Actor document
     * @ignore
     * @override
     */
    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        const current = foundry.utils.getProperty(this.system, attribute);
        if (isBar && attribute.startsWith('attributeBar')) {
            const barDefinition = foundry.utils.getProperty(this.system, attribute);
            if (barDefinition) {
                if (isDelta)
                    value = Number(current.value) + value;
                //@ts-expect-error Outdated types
                value = Math.clamp(0, value, barDefinition.max);
                attribute = 'props.' + barDefinition.key;
                isBar = false;
                isDelta = false;
            }
        }
        return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    }
    /**
     * Forward the roll function to the TemplateSystem
     * @returns {Promise<ComputablePhrase>} The rolled Computable Phrase
     * @see {@link TemplateSystem.roll}
     */
    async roll(rollKey, options = {}) {
        return this.templateSystem.roll(rollKey, options);
    }
    /**
     * Forwards the reload template function to the TemplateSystem
     * @see {@link TemplateSystem.reloadTemplate}
     */
    async reloadTemplate(templateId) {
        return this.templateSystem.reloadTemplate(templateId);
    }
}
Hooks.on('preCreateItem', (item, _createData, _options, _userId) => {
    if (item.isOwned) {
        const actor = item.parent;
        if (!actor.templateSystem.canOwnItem(item))
            return false; // prevent creation
    }
});
