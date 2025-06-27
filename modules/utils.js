/*
 * Copyright 2024 Jean-Baptiste Louvet-Daniel
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * @ignore
 */
export const postCustomSheetRoll = async (messageText, alternative = false) => {
    const actor = (canvas.tokens.controlled[0]?.actor ?? game.user.character);
    if (actor &&
        actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
        try {
            actor.roll(messageText, { alternative });
        }
        catch (err) {
            ui.notifications.error(err.message);
        }
    }
    else {
        ui.notifications.error(game.i18n.localize('CSB.ChatCommands.ActorNotFound'));
    }
};
/**
 * Posts a chat message with a computed phrase data
 * @ignore
 */
export const postAugmentedChatMessage = async (textContent, msgOptions, { rollMode, create } = { create: true }) => {
    rollMode = rollMode || game.settings.get('core', 'rollMode');
    // chat-roll is just the html template for computed formulas
    const template_file = `systems/${game.system.id}/templates/chat/chat-roll.hbs`;
    const template_file_groups = `systems/${game.system.id}/templates/chat/chat-roll-dice-pools.hbs`;
    let phrase = textContent.buildPhrase;
    if (!phrase) {
        return;
    }
    const values = textContent.values;
    const rolls = [];
    const diceGroups = [];
    // Render all formulas HTMLs
    for (const key in values) {
        let formattedValue = String(values[key].result);
        if (values[key].explanation) {
            formattedValue = await renderTemplate(template_file, {
                rollData: values[key],
                jsonRollData: JSON.stringify(values[key]).replaceAll(/\[\[/g, '[').replaceAll(/]]/g, ']'),
                rollMode: rollMode
            });
        }
        if (phrase.startsWith('/')) {
            formattedValue = formattedValue.replaceAll(/"/g, '\\"');
        }
        // Using function for replace to ignore problems linked to '$' character in replace function
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement
        phrase = phrase.replace(key, () => formattedValue);
        for (const roll of values[key].rolls) {
            const rollObject = Roll.fromData(roll.roll);
            rolls.push(rollObject);
            if (roll.expandRollInChatCard) {
                diceGroups.push(...getDiceGroupsFromRoll(rollObject, values[key].hidden));
            }
        }
    }
    phrase = phrase.replaceAll(/\n/g, '').trim();
    const diceGroupsRendered = await renderTemplate(template_file_groups, {
        dice: diceGroups,
        multipleDice: diceGroups.filter((group) => !group.hidden).length > 1
    });
    phrase += diceGroupsRendered;
    const chatRollData = {
        // @ts-expect-error Foundry not up to date in v12 yet
        rolls: rolls.map((roll) => roll.toJSON())
    };
    let whisper = null;
    // If setting expandRollVisibility is checked, we apply the appropriate whispers to the message
    if (game.settings.get(game.system.id, 'expandRollVisibility')) {
        const gmList = ChatMessage.getWhisperRecipients('GM');
        chatRollData.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
        switch (rollMode) {
            case CONST.DICE_ROLL_MODES.PRIVATE:
                whisper = gmList;
                break;
            case CONST.DICE_ROLL_MODES.BLIND:
                whisper = gmList;
                break;
            case CONST.DICE_ROLL_MODES.SELF:
                whisper = [game.user];
                break;
            default:
                break;
        }
    }
    else {
        chatRollData.rollMode = rollMode;
    }
    const chatData = foundry.utils.mergeObject(msgOptions, foundry.utils.mergeObject({
        content: phrase,
        whisper,
        sound: CONFIG.sounds.dice
    }, chatRollData));
    if (create) {
        // Final chat message creation
        if (Hooks.call('chatMessage', ui.chat, phrase, chatData) === false)
            return;
        return ChatMessage.create(chatData);
    }
    else {
        const msg = new ChatMessage(chatData);
        if (rollMode) {
            msg.applyRollMode(rollMode);
        }
        return msg.toObject();
    }
};
/**
 * @ignore
 */
export const removeNull = (obj) => {
    const newObj = {};
    Object.keys(obj).forEach((key) => {
        if (obj[key] === Object(obj[key]))
            newObj[key] = removeNull(obj[key]);
        else if (obj[key] !== null)
            newObj[key] = obj[key];
    });
    return newObj;
};
/**
 * @param value
 */
export const castToPrimitive = (value) => {
    if (typeof value === 'string') {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        const numericValue = parseInt(value);
        if (!Number.isNaN(numericValue) && /^[-+]?\d+$/.test(value)) {
            return numericValue;
        }
    }
    return value;
};
export const getGameCollectionAsTemplateSystems = (collectionType) => {
    switch (collectionType) {
        case 'actor':
            return game.actors.map((actor) => actor.templateSystem);
        case 'item':
            return game.items.map((item) => item.templateSystem);
        default:
            throw new Error(`Unknown entity type ${collectionType}`);
    }
};
export const getGameCollection = (collectionType) => {
    switch (collectionType) {
        case 'actor':
            return game.actors;
        case 'item':
            return game.items;
        default:
            throw new Error(`Unknown entity type ${collectionType}`);
    }
};
export const getLocalizedRoleList = (keyType) => {
    return Object.fromEntries(Object.entries(CONST.USER_ROLES).map(([key, value]) => [
        keyType == 'number' ? value : key,
        game.i18n.localize(`USER.Role${key.toLowerCase().capitalize()}`)
    ]));
};
export const getLocalizedPermissionList = (keyType) => {
    return Object.fromEntries(Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS).map(([key, value]) => [
        keyType == 'number' ? value : key,
        game.i18n.localize(`OWNERSHIP.${key}`)
    ]));
};
export const getLocalizedAlignmentList = (includeJustify = false) => {
    const alignments = {
        left: game.i18n.localize('CSB.ComponentProperties.Alignment.AlignLeft'),
        center: game.i18n.localize('CSB.ComponentProperties.Alignment.AlignCenter'),
        right: game.i18n.localize('CSB.ComponentProperties.Alignment.AlignRight')
    };
    if (includeJustify) {
        alignments.justify = game.i18n.localize('CSB.ComponentProperties.Alignment.AlignJustify');
    }
    return alignments;
};
export const updateKeysOnCopy = (components, availableKeys) => {
    for (const component of components) {
        //TODO remove this check once Table is composed of sub Components for Rows
        if (component) {
            if (component.key && availableKeys.has(component.key)) {
                let suffix = 1;
                const originalKey = component.key;
                do {
                    component.key = originalKey + '_copy' + suffix;
                    suffix++;
                } while (availableKeys.has(component.key));
            }
            if (component.contents && component.contents.length > 0) {
                if (Array.isArray(component.contents[0])) {
                    //TODO remove this once Table is composed of sub Components for Rows
                    component.contents = component.contents.map((row) => {
                        return updateKeysOnCopy(row, availableKeys);
                    });
                }
                else {
                    component.contents = updateKeysOnCopy(component.contents, availableKeys);
                }
            }
        }
    }
    return components;
};
export function quoteString(value) {
    if (value && typeof value === 'string') {
        return `'${value}'`;
    }
    return value === null ? null : value?.toString();
}
export function fastSetFlag(scope, key, value) {
    game.user.setFlag(scope, key, value);
    foundry.utils.setProperty(game.user.flags, `${scope}.${key}`, value);
}
export async function createProseMirrorEditor(container, contents, options = {}) {
    options = foundry.utils.mergeObject({
        collaborate: false,
        plugins: {
            //@ts-expect-error Outdated types
            highlightDocumentMatches: ProseMirror.ProseMirrorHighlightMatchesPlugin.build(
            //@ts-expect-error Outdated types
            ProseMirror.defaultSchema)
        }
    }, options);
    //@ts-expect-error Outdated types
    return ProseMirrorEditor.create(container, contents, options);
}
export function trimProseMirrorEmptyValue(value) {
    if (value === undefined) {
        return '';
    }
    const htmlValue = $(`<div>${value}</div>`);
    htmlValue.find('br.ProseMirror-trailingBreak').remove();
    htmlValue.find('.ProseMirror-selectednode').removeClass('ProseMirror-selectednode').removeAttr('draggable');
    value = htmlValue.html();
    if (value === '<p></p>') {
        return '';
    }
    return value;
}
export function getDiceGroupsFromRoll(roll, hidden) {
    const groups = [];
    const currentPool = { dice: [], formula: '', total: 0, hidden: hidden ?? false };
    let operator = '';
    for (const term of roll.terms) {
        if (term.rolls) {
            for (const roll of term.rolls) {
                groups.push(...getDiceGroupsFromRoll(roll, hidden));
            }
        }
        // @ts-expect-error Outdated types
        if (term instanceof foundry.dice.terms.ParentheticalTerm) {
            groups.push(...getDiceGroupsFromRoll(term.roll, hidden));
        }
        // @ts-expect-error Outdated types
        if (term instanceof foundry.dice.terms.DiceTerm) {
            currentPool.formula += operator + term.expression;
            currentPool.total += term.total;
            const tooltip = term.getTooltipData();
            currentPool.flavor = tooltip.flavor;
            // @ts-expect-error Outdated types
            currentPool.icon = tooltip.icon;
            // @ts-expect-error Outdated types
            currentPool.method = tooltip.method;
            for (const roll of tooltip.rolls) {
                currentPool.dice.push({
                    faces: tooltip.faces,
                    result: roll.result,
                    classes: roll.classes
                });
            }
            // @ts-expect-error Outdated types
        }
        else if (term instanceof foundry.dice.terms.OperatorTerm) {
            operator = term.formula;
        }
    }
    if (currentPool.dice.length > 0) {
        groups.push(currentPool);
    }
    return groups;
}
export function isModuleActive(moduleName) {
    return game.modules.has(moduleName) && game.modules.get(moduleName).active;
}
