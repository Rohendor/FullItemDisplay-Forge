// FullItemDisplay Component for Custom System Builder - Enhanced with Active Effects Support
// Displays the complete structure of EquippableItems within character sheets

// Global variables to hold imports
let Container, castToPrimitive, Formula, CustomItem;

// Define FullItemDisplay class after imports are loaded
let FullItemDisplay;

Hooks.on('init', async () => {
  console.log("====================================Initialize Full Item Display============================================");
  
  try {
    // Import all dependencies first
    Container = (await import('/jotunheim/systems/custom-system-builder/module/sheets/components/Container.js')).default;
    
    const utils = await import('/jotunheim/systems/custom-system-builder/module/utils.js');
    castToPrimitive = utils.castToPrimitive;
    
    Formula = (await import('/jotunheim/systems/custom-system-builder/module/formulas/Formula.js')).default;
    
    const itemModule = await import('/jotunheim/systems/custom-system-builder/module/documents/item.js');
    CustomItem = itemModule.CustomItem;
    
    console.log('[FullItemDisplay] All dependencies imported successfully');
    
    // Now define the class with all dependencies available
    FullItemDisplay = class extends Container {
      constructor(props) {
        super(props);
        this._title = props.title ?? '';
        this._templateFilter = props.templateFilter ?? [];
        this._itemFilterFormula = props.itemFilterFormula ?? '';
        this._showItemHeader = props.showItemHeader ?? true;
        this._collapsibleItems = props.collapsibleItems ?? false;
        this._defaultItemCollapsed = props.defaultItemCollapsed ?? false;
        this._showItemControls = props.showItemControls ?? true;
        this._itemLayout = props.itemLayout ?? 'vertical';
        this._hideEmpty = props.hideEmpty ?? false;
        
        // Track transferred effects for cleanup and change detection
        this._transferredEffects = new Map();
        this._lastEffectsHash = new Map(); // Track hash of effects to detect changes
      }

      async _getElement(entity, isEditable = true, options = {}) {
        const jQElement = await super._getElement(entity, isEditable, options);
        const internalContents = jQElement.hasClass('custom-system-component-contents') ? jQElement : jQElement.find('.custom-system-component-contents');

        const relevantItems = this.filterItems(entity, options);

        if (this._hideEmpty && relevantItems.length === 0 && !entity.isTemplate) {
          jQElement.addClass('hidden');
          return jQElement;
        }

        // Transfer active effects from nested items to the parent actor (only if needed)
        if (!entity.isTemplate && entity.entity?.isOwner) {
          const needsUpdate = await this._checkIfEffectsNeedUpdate(relevantItems, entity);
          if (needsUpdate) {
            console.log(`[FullItemDisplay] Effects need update for ${entity.entity.name}`);
            await this._transferNestedActiveEffects(relevantItems, entity);
          } else {
            console.log(`[FullItemDisplay] No effect changes detected for ${entity.entity.name}, skipping transfer`);
          }
        }

        if (this._title) {
          const titleElement = $('<h3></h3>').addClass('custom-system-full-item-display-title').text(this._title);
          internalContents.append(titleElement);
        }

        let layoutClass = 'flexcol';
        if (this._itemLayout === 'horizontal') layoutClass = 'flexrow';
        else if (this._itemLayout === 'grid2') layoutClass = 'grid grid-2col';
        else if (this._itemLayout === 'grid3') layoutClass = 'grid grid-3col';
        else if (this._itemLayout === 'grid4') layoutClass = 'grid grid-4col';
        else if (this._itemLayout === 'grid5') layoutClass = 'grid grid-5col';
        else if (this._itemLayout === 'grid6') layoutClass = 'grid grid-6col';

        internalContents.addClass(layoutClass);

        for (const item of relevantItems) {
          const itemContainer = await this._renderFullItemStructure(item, entity, isEditable, options);
          internalContents.append(itemContainer);
        }

        if (entity.isTemplate) {
          internalContents.append(await this.renderTemplateControls(entity));
        }

        return jQElement;
      }

      /**
       * Check if a field update might affect active effects
       */
      _updateMightAffectEffects(fieldPath, value, item) {
        // Define patterns that might affect active effects
        const effectRelatedPatterns = [
          /^effects\./,           // Direct effect changes
          /\.effects\./,          // Nested effect changes
          /^system\.effects/,     // System effects
          /\.transfer$/,          // Transfer property changes
          /\.disabled$/,          // Disabled state changes
          /\.changes\./,          // Effect changes array
          /\.duration\./,         // Duration changes
          /\.flags\./,            // Flag changes that might affect effects
          /^flags\./,             // Top-level flag changes
          /equipped$/,            // Equipment state (might affect effect transfer)
          /active$/,              // Active state
          /enabled$/,             // Enabled state
          /\.active$/,            // Nested active state
          /\.enabled$/,           // Nested enabled state
        ];

        // Check if the field path matches any effect-related pattern
        const matchesPattern = effectRelatedPatterns.some(pattern => pattern.test(fieldPath));
        
        if (matchesPattern) {
          return true;
        }

        const hasConditionalEffects = this._itemHasConditionalEffects(item);
        if (hasConditionalEffects) {
          const conditionalPatterns = [
            /\.value$/,            // Value changes
            /\.current$/,          // Current value changes
            /\.max$/,              // Maximum value changes
          ];
          
          return conditionalPatterns.some(pattern => pattern.test(fieldPath));
        }

        return false;
      }

      /**
       * Check if an item has conditional effects that might depend on other properties
       */
      _itemHasConditionalEffects(item) {
        // Get all nested items with effects
        const itemsWithEffects = this._getNestedItemsWithEffects(item);
        
        for (const nestedItem of itemsWithEffects) {
          for (const effect of nestedItem.effects) {
            // Check if any effect changes reference variables or formulas
            for (const change of effect.changes) {
              if (typeof change.value === 'string') {
                // Look for formula patterns (customize based on your system)
                if (change.value.includes('@') || 
                    change.value.includes('{{') || 
                    change.value.includes('${') ||
                    change.value.includes('system.') ||
                    change.value.includes('props.')) {
                  return true;
                }
              }
            }
            
            // Check if effect has conditional flags or duration formulas
            if (effect.flags && typeof effect.flags === 'object') {
              const flagString = JSON.stringify(effect.flags);
              if (flagString.includes('@') || 
                  flagString.includes('{{') || 
                  flagString.includes('system.') ||
                  flagString.includes('props.')) {
                return true;
              }
            }
          }
        }
        
        return false;
      }

      /**
       * Check if active effects need to be updated by comparing current state with cached hash
       */
      async _checkIfEffectsNeedUpdate(items, parentEntity) {
        const actor = parentEntity.entity;
        if (!actor || actor.documentName !== 'Actor') return false;

        const actorId = actor.id;
        const currentEffectsHash = this._generateEffectsHash(items);
        const lastHash = this._lastEffectsHash.get(actorId);

        // Check if this is the first time or if the hash has changed
        const needsUpdate = !lastHash || lastHash !== currentEffectsHash;
        
        if (needsUpdate) {
          this._lastEffectsHash.set(actorId, currentEffectsHash);
        }

        return needsUpdate;
      }

      /**
       * Generate a hash of all relevant active effects from nested items
       */
      _generateEffectsHash(items) {
        const effectsData = [];
        
        for (const item of items) {
          const nestedItemsWithEffects = this._getNestedItemsWithEffects(item);
          
          for (const nestedItem of nestedItemsWithEffects) {
            const transferableEffects = nestedItem.effects.filter(effect => 
              effect.transfer && !effect.disabled
            );

            for (const effect of transferableEffects) {
              // Create a simplified representation for hashing
              effectsData.push({
                itemId: nestedItem.id,
                parentId: item.id,
                effectId: effect.id,
                name: effect.name,
                disabled: effect.disabled,
                transfer: effect.transfer,
                // Include key effect properties that would affect the transfer
                changes: effect.changes.map(change => ({
                  key: change.key,
                  value: change.value,
                  mode: change.mode
                })),
                // Include flags that might affect behavior
                flags: effect.flags,
                // Include timing properties
                duration: {
                  startTime: effect.duration?.startTime,
                  seconds: effect.duration?.seconds,
                  rounds: effect.duration?.rounds,
                  turns: effect.duration?.turns
                }
              });
            }
          }
        }

        // Create a simple hash from the stringified data
        return this._hashString(JSON.stringify(effectsData));
      }

      /**
       * Simple string hashing function
       */
      _hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
      }

      /**
       * Transfer active effects from nested items to the parent actor
       * This handles the case where items contain other items with active effects
       */
      async _transferNestedActiveEffects(items, parentEntity) {
        const actor = parentEntity.entity;
        if (!actor || actor.documentName !== 'Actor') return;

        // Clean up previously transferred effects
        await this._cleanupTransferredEffects(actor);

        for (const item of items) {
          // Get all nested items that have active effects
          const nestedItemsWithEffects = this._getNestedItemsWithEffects(item);
          
          for (const nestedItem of nestedItemsWithEffects) {
            const effectsToTransfer = nestedItem.effects.filter(effect => 
              effect.transfer && !effect.disabled
            );

            for (const effect of effectsToTransfer) {
              try {
                // Create a copy of the effect on the actor
                const effectData = effect.toObject();
                
                // Mark this effect as transferred by this component
                effectData.flags = effectData.flags || {};
                effectData.flags['custom-system-builder'] = effectData.flags['custom-system-builder'] || {};
                effectData.flags['custom-system-builder'].transferredBy = this.key;
                effectData.flags['custom-system-builder'].sourceItemId = nestedItem.id;
                effectData.flags['custom-system-builder'].sourceItemName = nestedItem.name;
                effectData.flags['custom-system-builder'].parentItemId = item.id;
                effectData.flags['custom-system-builder'].parentItemName = item.name;
                
                // Modify the effect name to show the source
                effectData.name = `${effectData.name} (from ${nestedItem.name})`;
                
                const createdEffect = await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
                
                // Track the created effect for cleanup
                if (!this._transferredEffects.has(actor.id)) {
                  this._transferredEffects.set(actor.id, []);
                }
                this._transferredEffects.get(actor.id).push(createdEffect[0].id);
                
                console.log(`[FullItemDisplay] Transferred active effect "${effect.name}" from ${nestedItem.name} to ${actor.name}`);
              } catch (error) {
                console.error(`[FullItemDisplay] Error transferring active effect from ${nestedItem.name}:`, error);
              }
            }
          }
        }
      }

      /**
       * Recursively find all nested items that have active effects
       */
      _getNestedItemsWithEffects(item) {
        const itemsWithEffects = [];
        
        // Check if this item has effects
        if (item.effects && item.effects.size > 0) {
          itemsWithEffects.push(item);
        }
        
        // Check nested items recursively
        if (item.items) {
          for (const nestedItem of item.items) {
            itemsWithEffects.push(...this._getNestedItemsWithEffects(nestedItem));
          }
        }
        
        return itemsWithEffects;
      }

      /**
       * Clean up previously transferred effects
       */
      async _cleanupTransferredEffects(actor) {
        const existingTransferredEffects = actor.effects.filter(effect => 
          effect.flags?.['custom-system-builder']?.transferredBy === this.key
        );

        if (existingTransferredEffects.length > 0) {
          const effectIds = existingTransferredEffects.map(effect => effect.id);
          await actor.deleteEmbeddedDocuments('ActiveEffect', effectIds);
          console.log(`[FullItemDisplay] Cleaned up ${effectIds.length} previously transferred effects`);
        }

        // Clear our tracking
        if (this._transferredEffects.has(actor.id)) {
          this._transferredEffects.delete(actor.id);
        }
      }

      async _renderFullItemStructure(item, entity, isEditable, options) {
        const itemWrapper = $('<div></div>').addClass('custom-system-full-item-wrapper').attr('data-item-id', item.id);
        const itemTemplate = game.items?.get(item.system.template);

        if (!itemTemplate) {
          return $('<div></div>').addClass('custom-system-item-template-error').html(`<i class="fas fa-exclamation-triangle"></i> Template not found for item: ${item.name}`);
        }
        
        item.entity = entity.entity;
        
        if (this._collapsibleItems) {
          const isExpanded = game.user.getFlag(game.system.id, `${entity.uuid}.${this.templateAddress}.${item.id}.expanded`) ?? !this._defaultItemCollapsed;
          const detailsElement = $('<details></details>').addClass('custom-system-full-item-details');
          if (isExpanded) detailsElement.attr('open', 'open');

          detailsElement.on('toggle', (e) => {
            game.user.setFlag(game.system.id, `${entity.uuid}.${this.templateAddress}.${item.id}.expanded`, e.currentTarget.open);
          });

          const summaryElement = $('<summary></summary>').addClass('custom-system-full-item-summary').append(await this._renderItemHeader(item, entity, isEditable, options));
          detailsElement.append(summaryElement);

          const contentElement = $('<div></div>').addClass('custom-system-full-item-content');
          const renderedTemplate = await this._renderItemTemplate(item, itemTemplate, entity, isEditable, options);
          contentElement.append(renderedTemplate);
          detailsElement.append(contentElement);

          itemWrapper.append(detailsElement);
        } else {
          if (this._showItemHeader) {
            itemWrapper.append($('<div></div>').addClass('custom-system-full-item-header').append(await this._renderItemHeader(item, entity, isEditable, options)));
          }

          const contentElement = $('<div></div>').addClass('custom-system-full-item-content');
          const renderedTemplate = await this._renderItemTemplate(item, itemTemplate, entity, isEditable, options);
          contentElement.append(renderedTemplate);
          itemWrapper.append(contentElement);
        }

        return itemWrapper;
      }

      async _renderItemHeader(item, entity, isEditable, options) {
        const headerDiv = $('<div></div>').addClass('custom-system-item-header-content flexrow');
        const itemLink = $('<a></a>').addClass('content-link')
          .attr({
            'data-type': 'Item',
            'data-entity': 'Item',
            'data-id': item.id,
            'data-uuid': item.uuid,
            'data-tooltip': item.name,
            draggable: true
          }).text(item.name)
          .on('click', () => item.sheet?.render(true));
        headerDiv.append(itemLink);

        if (this._showItemControls && isEditable && !entity.isTemplate) {
          const controlsDiv = $('<div></div>').addClass('custom-system-item-controls');

          const editButton = $('<a></a>').addClass('custom-system-clickable').attr('title', 'Edit Item').html('<i class="fas fa-edit"></i>')
            .on('click', () => item.sheet?.render(true));
          const deleteButton = $('<a></a>').addClass('custom-system-clickable').attr('title', 'Delete Item').html('<i class="fas fa-trash"></i>')
            .on('click', async () => {
              const confirmed = await Dialog.confirm({
                title: 'Delete Item',
                content: `<p>Are you sure you want to delete "${item.name}"?</p>`,
                yes: () => true,
                no: () => false
              });
              if (confirmed) {
                // Clean up transferred effects before deleting
                if (entity.entity && entity.entity.documentName === 'Actor') {
                  await this._cleanupTransferredEffects(entity.entity);
                }
                await item.delete();
                entity.render(false);
              }
            });

          controlsDiv.append(editButton).append(deleteButton);
          headerDiv.append(controlsDiv);
        }

        return headerDiv;
      }

      async _renderItemTemplate(item, itemTemplate, entity, isEditable, options) {
        const templateDiv = $('<div></div>').addClass('custom-system-item-template-structure');

        try {
          if (!itemTemplate || !itemTemplate.system?.body) {
            return templateDiv.html(`<i class="fas fa-exclamation-triangle"></i> Template or body not found for item: ${item.name}`);
          }

          const bodyComponent = componentFactory.createOneComponent(
            itemTemplate.system.body,
            `${this.templateAddress}.${item.id}.body`,
            this
          );

          const renderOptions = {
            ...options,
            reference: `${this.key}.${item.id}`,
            linkedEntity: item,
            customProps: {
              ...(options.customProps || {}),
              itemSystemProps: item.system.props,
              itemTemplateSystemProps: itemTemplate.system.props,
              item: item.system.props
            }
          };

          const renderedBody = await bodyComponent.render(item, isEditable, renderOptions);
          templateDiv.append(renderedBody);

          // Patch: Make field updates persist to item
          if (isEditable) {
            renderedBody.find('input, textarea, select').on('change', async (event) => {
              const input = event.currentTarget;
              const path = input.name;
              if (!path) return;
              const value = input.type === 'checkbox' ? input.checked : input.value;
              try {
                await item.update({ [path]: value });
                
                // Only mark effects as needing update if the change might affect active effects
                if (entity.entity && entity.entity.documentName === 'Actor') {
                  const mightAffectEffects = this._updateMightAffectEffects(path, value, item);
                  if (mightAffectEffects) {
                    // Clear the hash to force re-evaluation on next render
                    this._lastEffectsHash.delete(entity.entity.id);
                    console.log(`[FullItemDisplay] Item ${item.name} field '${path}' updated, effects will be re-evaluated on next render`);
                  } else {
                    console.log(`[FullItemDisplay] Item ${item.name} field '${path}' updated, but won't affect effects`);
                  }
                }
              } catch (err) {
                console.error(`Error updating item field '${path}'`, err);
              }
            });
          }
        } catch (error) {
          console.error(`[FullItemDisplay] Error rendering template for item "${item.name}":`, error);
          templateDiv.append(`<div class="custom-system-template-render-error"><i class="fas fa-exclamation-triangle"></i> Error rendering ${item.name}</div>`);
        }

        return templateDiv;
      }

      filterItems(entity, options) {
        return entity.items.filter((item) => {
          if (item.type !== 'equippableItem') return false;
          if (this._templateFilter.length && !this._templateFilter.includes(item.system.template)) return false;

          if (this._itemFilterFormula) {
            try {
              const result = new Formula(this._itemFilterFormula).computeStatic({
                ...entity.system.props,
                item: item.system.props
              }, { ...options, source: `${this.key}.${item.name}.filter` }).result;
              return !!castToPrimitive(result);
            } catch (error) {
              console.warn('Item filter formula error:', error);
              return true;
            }
          }

          return true;
        });
      }

      toJSON() {
        return {
          ...super.toJSON(),
          title: this._title,
          templateFilter: this._templateFilter,
          itemFilterFormula: this._itemFilterFormula,
          showItemHeader: this._showItemHeader,
          collapsibleItems: this._collapsibleItems,
          defaultItemCollapsed: this._defaultItemCollapsed,
          showItemControls: this._showItemControls,
          itemLayout: this._itemLayout,
          hideEmpty: this._hideEmpty
        };
      }

      static fromJSON(json, templateAddress, parent) {
        return new FullItemDisplay({
          key: json.key,
          tooltip: json.tooltip,
          templateAddress: templateAddress,
          cssClass: json.cssClass,
          title: json.title,
          templateFilter: json.templateFilter,
          itemFilterFormula: json.itemFilterFormula,
          showItemHeader: json.showItemHeader,
          collapsibleItems: json.collapsibleItems,
          defaultItemCollapsed: json.defaultItemCollapsed,
          showItemControls: json.showItemControls,
          itemLayout: json.itemLayout,
          hideEmpty: json.hideEmpty,
          contents: [],
          role: json.role,
          permission: json.permission,
          visibilityFormula: json.visibilityFormula,
          parent: parent
        });
      }

      static getTechnicalName() {
        return 'fullItemDisplay';
      }

      static getPrettyName() {
        return game.i18n.localize('CSB.ComponentProperties.ComponentType.FullItemDisplay');
      }

      static async getConfigForm(existingComponent, entity) {
        const predefinedValues = { ...existingComponent };
        predefinedValues.title ??= '';
        predefinedValues.showItemHeader ??= true;
        predefinedValues.collapsibleItems ??= false;
        predefinedValues.defaultItemCollapsed ??= false;
        predefinedValues.showItemControls ??= true;
        predefinedValues.itemLayout ??= 'vertical';
        predefinedValues.hideEmpty ??= false;
        predefinedValues.itemFilterFormula ??= '';

        predefinedValues.availableTemplates = (game.items?.filter(i => i.type === '_equippableItemTemplate') || []).map(template => ({
          id: template.id,
          name: template.name,
          checked: existingComponent?.templateFilter?.includes(template.id)
        }));

        const mainElt = $('<div></div>');
        mainElt.append(await renderTemplate(`modules/full-item-display/csb-components/templates/_template/components/fullItemDisplay.hbs`, predefinedValues));
        return mainElt;
      }

      static extractConfig(html) {
        const superData = super.extractConfig(html);
        return {
          ...superData,
          title: html.find('#fullItemTitle').val()?.toString() ?? '',
          showItemHeader: html.find('#showItemHeader').is(':checked'),
          collapsibleItems: html.find('#collapsibleItems').is(':checked'),
          defaultItemCollapsed: html.find('#defaultItemCollapsed').is(':checked'),
          showItemControls: html.find('#showItemControls').is(':checked'),
          itemLayout: html.find('#itemLayout').val()?.toString() ?? 'vertical',
          hideEmpty: html.find('#hideEmpty').is(':checked'),
          itemFilterFormula: html.find('#itemFilterFormula').val()?.toString() ?? '',
          templateFilter: html.find('input[name=templateFilter]:checked').map(function () {
            return $(this).val()?.toString();
          }).get()
        };
      }
    };

    // Register the component type
    componentFactory.addComponentType('fullItemDisplay', FullItemDisplay);
    console.log('[FullItemDisplay] Component registered successfully');
    
  } catch (error) {
    console.error('[FullItemDisplay] Error during initialization:', error);
  }
});

Hooks.once('init', async () => {
  try {
    // CustomItem should already be imported above, but just in case
    if (!CustomItem) {
      const itemModule = await import('/jotunheim/systems/custom-system-builder/module/documents/item.js');
      CustomItem = itemModule.CustomItem;
    }
    
    // Add methods to CustomItem prototype
    Object.defineProperty(CustomItem.prototype, 'getSortedConditionalModifiers', {
      value: function() {
        return {};
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
    
    Object.defineProperty(CustomItem.prototype, 'getSortedActiveEffects', {
      value: function(system, includeDisabled = false) {
        return {};
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
    
    console.log('[FullItemDisplay] CustomItem methods added successfully');
  } catch (error) {
    console.error('[FullItemDisplay] Error adding CustomItem methods:', error);
  }
});

// Export for external use if needed (though this might not work in all contexts with this approach)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FullItemDisplay };
}