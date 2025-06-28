import { isModuleActive } from '../utils.js';
import Logger from '../Logger.js';
class CustomActiveEffect extends ActiveEffect {
    static async _onCreateOperation(documents, operation, user) {
        if (user.id === game.user.id) {
            for (const effect of documents) {
                if (!effect.getFlag(game.system.id, 'originalUuid') || effect.parent.isTemplate) {
                    await effect.setFlag(game.system.id, 'originalParentId', effect.parent.id);
                    await effect.setFlag(game.system.id, 'originalId', effect.id);
                    await effect.setFlag(game.system.id, 'originalUuid', effect.uuid);
                    await effect.setFlag(game.system.id, 'isFromTemplate', effect.parent.isTemplate);
                }
            }
        }
        //@ts-expect-error Outdated types
        return super._onCreateOperation(documents, operation, user);
    }
    get count() {
        if (!isModuleActive('statuscounter')) {
            return 1;
        }
        return foundry.utils.getProperty(this, this.statusCounter.dataSource);
    }
    get tags() {
        //@ts-expect-error Outdated types
        return this.system.tags ?? [];
    }
    apply(actor, change, shouldThrow = false) {
        if (!CustomActiveEffect.APPLICABLE_DOCUMENT_TYPES.includes(this.parent.type)) {
            return;
        }
        const props = {
            ...this.parent.system.props,
            target: actor.system.props
        };
        let changeKeys = [];
        try {
            changeKeys = ComputablePhrase.computeMessageStatic(change.key, props, {
                source: `activeEffect.${this.name}.key`,
                triggerEntity: this.parent.templateSystem
            }).result.split(',');
            let changes = {};
            for (const key of changeKeys) {
                change.key = key;
                let refInTarget = false;
                if (change.key.startsWith('target.')) {
                    change.key = change.key.substring(7);
                    refInTarget = true;
                }
                if (change.key.startsWith('props')) {
                    change.key = `system.${change.key}`;
                }
                else if (!change.key.startsWith('system')) {
                    change.key = `system.props.${change.key}`;
                }
                let reference = undefined;
                if (foundry.utils.getProperty(actor, change.key) === undefined) {
                    change.key = key;
                }
                else {
                    const sanitizedKey = change.key.substring(13);
                    if (sanitizedKey.includes('.')) {
                        const splitKey = sanitizedKey.split('.');
                        reference = `${refInTarget ? 'target.' : ''}${splitKey[0]}.${splitKey[1]}`;
                    }
                }
                change.value = ComputablePhrase.computeMessageStatic(change.value, props, {
                    source: `activeEffect.${this.name}.value`,
                    triggerEntity: this.parent.templateSystem,
                    reference
                }).result;
                changes = { ...changes, ...super.apply(actor, change) };
            }
            return changes;
        }
        catch (err) {
            if (shouldThrow) {
                throw err;
            }
            Logger.error(`Error when computing active effet value ${this.name} - ${change.key} for entity ${actor.name}`, err, { keys: changeKeys });
            return {};
        }
    }
    /**
     * Create an ActiveEffect instance from status effect data.
     */
    static async _fromStatusEffect(statusId, effectData, options) {
        const statusEffect = CONFIG.statusEffects.find((e) => e.id === statusId);
        if (statusEffect && statusEffect.linkedEffectId) {
            const activeEffect = this.getPredefinedEffect(statusEffect.linkedEffectId);
            if (activeEffect) {
                return activeEffect;
            }
        }
        //@ts-expect-error Outdated types
        return super._fromStatusEffect(statusId, effectData, options);
    }
    /**
     * Adds or update the CustomActiveEffect to the predefined list
     */
    async addToPredefinedEffects() {
        const predefinedEffects = CustomActiveEffect.getContainerItem().effects;
        const existingEffect = predefinedEffects.getName(this.name);
        if (existingEffect) {
            await existingEffect.update(this.toJSON());
        }
        else {
            await CustomActiveEffect.getContainerItem().createEmbeddedDocuments('ActiveEffect', [this.toJSON()]);
        }
    }
    /**
     * Removes the CustomActiveEffect from the predefined list by its name
     */
    async removeFromPredefinedEffects() {
        const predefinedEffects = CustomActiveEffect.getContainerItem().effects;
        const existingEffect = predefinedEffects.getName(this.name);
        if (existingEffect) {
            await existingEffect.delete();
        }
    }
    static getContainerItem() {
        if (!this.CONTAINER_ITEM) {
            this.CONTAINER_ITEM = game.items?.find((item) => item.type === 'activeEffectContainer');
        }
        return this.CONTAINER_ITEM;
    }
    /**
     * Get the basic information of predefined Active Effects
     * @returns An array with the Ids and Names of the predefined Active Effects
     */
    static getPredefinedEffectsData() {
        if (!isModuleActive('dfreds-convenient-effects')) {
            return this.getContainerItem()
                .effects.map((effect) => {
                return { id: effect.id, name: effect.name };
            })
                .sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
        }
        else {
            const convenientEffectsApiSource = game.modules.get('dfreds-convenient-effects').api ??
                game.dfreds.effectInterface;
            return convenientEffectsApiSource
                .findEffects()
                .map((effect) => {
                return { id: effect.id, name: effect.name };
            })
                .sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
        }
    }
    static getPredefinedEffect(effectId) {
        if (!isModuleActive('dfreds-convenient-effects')) {
            return this.getContainerItem().effects.get(effectId);
        }
        else {
            const convenientEffectsApiSource = game.modules.get('dfreds-convenient-effects').api ??
                game.dfreds.effectInterface;
            return convenientEffectsApiSource.findEffect({ effectId });
        }
    }
    /**
     * Add a predefined Active Effect to an entity
     * @param entity The entity to add the effect to
     * @param effectId The predefined effect ID to add
     */
    static addActiveEffect(entity, effectId) {
        if (!isModuleActive('dfreds-convenient-effects')) {
            const predefinedEffects = CustomActiveEffect.getContainerItem().effects;
            const existingEffect = predefinedEffects.get(effectId);
            if (existingEffect) {
                entity.createEmbeddedDocuments('ActiveEffect', [existingEffect.toJSON()]);
                return existingEffect;
            }
        }
        else {
            const convenientEffectsApiSource = game.modules.get('dfreds-convenient-effects').api ??
                game.dfreds.effectInterface;
            convenientEffectsApiSource.addEffect({ effectId: String(effectId), uuid: entity.uuid });
        }
    }
    /**
     * Removes a predefined Active Effect from an entity
     * @param entity The entity to add the effect to
     * @param effectId The predefined effect ID to add
     */
    static removeActiveEffects(entity, effects) {
        if (!isModuleActive('dfreds-convenient-effects')) {
            entity.deleteEmbeddedDocuments('ActiveEffect', effects.map((effect) => effect.id));
        }
        else {
            const convenientEffectsApiSource = game.modules.get('dfreds-convenient-effects').api ??
                game.dfreds.effectInterface;
            const toRemoveNormally = [];
            for (const effect of effects) {
                if (effect.getFlag('dfreds-convenient-effects', 'isConvenient')) {
                    convenientEffectsApiSource.removeEffect({
                        effectId: effect.getFlag('dfreds-convenient-effects', 'ceEffectId'),
                        uuid: entity.uuid
                    });
                }
                else {
                    toRemoveNormally.push(effect.id);
                }
            }
            entity.deleteEmbeddedDocuments('ActiveEffect', toRemoveNormally);
        }
    }
}
CustomActiveEffect.APPLICABLE_DOCUMENT_TYPES = ['equippableItem', 'character'];
export default CustomActiveEffect;
Hooks.on('getActiveEffectConfigHeaderButtons', (app, buttons) => {
    if (!isModuleActive('dfreds-convenient-effects')) {
        const predefinedEffects = CustomActiveEffect.getContainerItem().effects;
        const effectExists = predefinedEffects.has(app.document.name);
        let addButtonLabel = 'CSB.ActiveEffects.AddToPredefinedButton.Text';
        let addButtonTooltip = 'CSB.ActiveEffects.AddToPredefinedButton.Tooltip';
        if (effectExists) {
            buttons.unshift({
                label: game.i18n.localize('CSB.ActiveEffects.RemoveFromPredefinedButton.Text'),
                class: 'csb-remove-predefined-active-effect',
                icon: 'fas fa-trash',
                tooltip: game.i18n.localize('CSB.ActiveEffects.RemoveFromPredefinedButton.Tooltip'),
                onclick: () => {
                    const activeEffect = app.document;
                    activeEffect.removeFromPredefinedEffects().then(() => {
                        app.close().then(() => {
                            activeEffect.sheet?.render(true);
                        });
                    });
                }
            });
            addButtonLabel = 'CSB.ActiveEffects.UpdatePredefinedButton.Text';
            addButtonTooltip = 'CSB.ActiveEffects.UpdatePredefinedButton.Tooltip';
        }
        buttons.unshift({
            label: game.i18n.localize(addButtonLabel),
            class: 'csb-add-predefined-active-effect',
            icon: 'fas fa-file-export',
            tooltip: game.i18n.localize(addButtonTooltip),
            onclick: () => {
                const activeEffect = app.document;
                activeEffect.addToPredefinedEffects().then(() => {
                    app.close().then(() => {
                        activeEffect.sheet?.render(true);
                    });
                });
            }
        });
    }
});
Hooks.on('applyActiveEffect', applyCustomActiveEffectChange);
function applyCustomActiveEffectChange(actor, change, current, _delta, changes) {
    if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
        return;
    }
    try {
        changes[change.key] = ComputablePhrase.computeMessageStatic(change.value, { ...actor.system.props, current }, {
            source: `activeEffect.${change.key}.value`,
            triggerEntity: actor.templateSystem
        }).result;
    }
    catch (_err) {
        changes[change.key] = 'ERROR';
    }
}
Hooks.on('preCreateActiveEffect', (effect) => {
    if (isModuleActive('dfreds-convenient-effects')) {
        if (effect.parent.type === 'activeEffectContainer' && !effect?.flags?.['dfreds-convenient-effects']) {
            const convenientEffectsApiSource = game.modules.get('dfreds-convenient-effects').api ??
                game.dfreds.effectInterface;
            effect.flags['dfreds-convenient-effects'] = {
                fromDrop: true
            };
            convenientEffectsApiSource.createNewEffects({
                existingFolderId: effect.parent.id,
                effectsData: [effect.toJSON()]
            });
            return false;
        }
    }
    let sourceUpdates = { 'flags.statuscounter.config.multiplyEffect': true };
    if (effect.parent.type === 'activeEffectContainer') {
        sourceUpdates = {
            ...sourceUpdates,
            [`flags.${game.system.id}.isPredefined`]: true,
            'flags.dfreds-convenient-effects.ceEffectId': effect.name?.slugify(),
            'flags.dfreds-convenient-effects.isConvenient': true,
            'flags.dfreds-convenient-effects.isViewable': true,
            'flags.dfreds-convenient-effects.isTemporary': false
        };
    }
    //@ts-expect-error Outdated types
    effect.updateSource(sourceUpdates);
});
