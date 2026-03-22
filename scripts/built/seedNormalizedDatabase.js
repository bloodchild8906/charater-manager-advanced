"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedNormalizedDatabase = seedNormalizedDatabase;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const SOURCE_COLUMNS = [
    'id',
    'code',
    'name',
    'publisher',
    'license_name',
    'license_url',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const LOOKUP_COLUMNS = [
    'id',
    'source_id',
    'lookup_type',
    'code',
    'name',
    'parent_lookup_id',
    'sort_order',
    'numeric_value',
    'text_value',
    'json_value',
    'description',
    'is_active',
    'created_at',
    'updated_at',
];
const ENTITY_COLUMNS = [
    'id',
    'source_id',
    'entity_type',
    'parent_entity_id',
    'slug',
    'code',
    'name',
    'size_lookup_id',
    'spellcasting_ability_lookup_id',
    'hit_die',
    'level_min',
    'level_max',
    'primary_lookup_ids',
    'granted_lookup_ids',
    'movement_json',
    'prerequisite_json',
    'choice_rules_json',
    'stats_json',
    'tags_json',
    'description',
    'srd',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const FEATURE_COLUMNS = [
    'id',
    'source_id',
    'feature_type',
    'slug',
    'code',
    'name',
    'level_required',
    'activation_lookup_id',
    'rest_lookup_id',
    'repeatable',
    'requires_choice',
    'prerequisite_json',
    'choice_options_json',
    'uses_json',
    'effects_json',
    'tags_json',
    'description',
    'short_description',
    'srd',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const SPELL_COLUMNS = [
    'id',
    'source_id',
    'slug',
    'code',
    'name',
    'level',
    'school_lookup_id',
    'activation_lookup_id',
    'casting_time',
    'range_text',
    'duration_text',
    'save_ability_lookup_id',
    'ritual',
    'concentration',
    'verbal',
    'somatic',
    'material',
    'material_description',
    'attack_type',
    'components_json',
    'damage_json',
    'scaling_json',
    'tags_json',
    'description',
    'higher_level_text',
    'srd',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const ITEM_COLUMNS = [
    'id',
    'source_id',
    'slug',
    'code',
    'name',
    'item_type_lookup_id',
    'equipment_slot_lookup_id',
    'rarity_lookup_id',
    'cost_currency_lookup_id',
    'weight_lb',
    'cost_amount',
    'is_magical',
    'requires_attunement',
    'stackable',
    'consumable',
    'tags_json',
    'properties_json',
    'profile_json',
    'description',
    'srd',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const ACTOR_COLUMNS = [
    'id',
    'source_id',
    'slug',
    'code',
    'name',
    'actor_type',
    'parent_actor_id',
    'taxonomy_lookup_id',
    'size_lookup_id',
    'alignment_lookup_id',
    'challenge_rating',
    'proficiency_bonus',
    'armor_class',
    'hit_points',
    'hit_dice',
    'initiative_bonus',
    'passive_perception',
    'abilities_json',
    'saves_json',
    'skills_json',
    'movement_json',
    'senses_json',
    'languages_json',
    'immunities_json',
    'resistances_json',
    'vulnerabilities_json',
    'conditions_json',
    'traits_json',
    'actions_json',
    'spellcasting_json',
    'inventory_json',
    'description',
    'srd',
    'is_homebrew',
    'created_at',
    'updated_at',
];
const LINK_COLUMNS = [
    'id',
    'source_id',
    'link_type',
    'left_table',
    'left_id',
    'right_table',
    'right_id',
    'relationship_role',
    'sort_order',
    'level_required',
    'quantity',
    'metadata_json',
    'created_at',
    'updated_at',
];
class SeedContext {
    constructor() {
        this.now = new Date().toISOString();
        this.sourceRows = [];
        this.lookupRows = [];
        this.entityRows = [];
        this.featureRows = [];
        this.spellRows = [];
        this.itemRows = [];
        this.actorRows = [];
        this.linkRows = [];
        this.sourceIds = new Map();
        this.registryByApi = new Map();
        this.lookupIdsByKey = new Map();
        this.entityIdsByKey = new Map();
        this.featureIdsByKey = new Map();
        this.spellIdsByKey = new Map();
        this.itemIdsByKey = new Map();
        this.actorIdsByKey = new Map();
        this.linkKeys = new Set();
    }
    addSource(sourceCode, name, publisher, licenseName, licenseUrl) {
        const id = stableUuid(`sources:${sourceCode}`);
        this.sourceIds.set(sourceCode, id);
        this.sourceRows.push({
            id,
            code: sourceCode,
            name,
            publisher,
            license_name: licenseName,
            license_url: licenseUrl,
            is_homebrew: false,
            created_at: this.now,
            updated_at: this.now,
        });
        return id;
    }
    getSourceId(sourceCode) {
        const id = this.sourceIds.get(sourceCode);
        if (!id) {
            throw new Error(`Missing source id for ${sourceCode}`);
        }
        return id;
    }
    addLookup(options) {
        var _a, _b, _c, _d, _e;
        const lookupKey = `${options.lookupType}:${options.code}`;
        const existingId = this.lookupIdsByKey.get(lookupKey);
        if (existingId) {
            if (options.register) {
                for (const registration of options.register) {
                    this.registerApi(registration.year, registration.collection, registration.code, 'lookups', existingId, options.sourceCode, options.code, options.name);
                }
            }
            return existingId;
        }
        const id = stableUuid(`lookups:${lookupKey}`);
        this.lookupIdsByKey.set(lookupKey, id);
        this.lookupRows.push({
            id,
            source_id: this.getSourceId(options.sourceCode),
            lookup_type: options.lookupType,
            code: options.code,
            name: options.name,
            parent_lookup_id: (_a = options.parentLookupId) !== null && _a !== void 0 ? _a : null,
            sort_order: (_b = options.sortOrder) !== null && _b !== void 0 ? _b : null,
            numeric_value: (_c = options.numericValue) !== null && _c !== void 0 ? _c : null,
            text_value: (_d = options.textValue) !== null && _d !== void 0 ? _d : null,
            json_value: toJson(options.jsonValue),
            description: (_e = options.description) !== null && _e !== void 0 ? _e : null,
            is_active: true,
            created_at: this.now,
            updated_at: this.now,
        });
        if (options.register) {
            for (const registration of options.register) {
                this.registerApi(registration.year, registration.collection, registration.code, 'lookups', id, options.sourceCode, options.code, options.name);
            }
        }
        return id;
    }
    addEntity(sourceCode, entityType, code, row, collection) {
        const key = `${sourceCode}:${entityType}:${code}`;
        const id = stableUuid(`entities:${key}`);
        this.entityIdsByKey.set(key, id);
        this.entityRows.push(Object.assign({ id, source_id: this.getSourceId(sourceCode), created_at: this.now, updated_at: this.now }, row));
        this.registerApi(sourceCode, collection, code, 'entities', id, sourceCode, code, row.name);
        return id;
    }
    addFeature(sourceCode, featureType, code, row, collection) {
        const key = `${sourceCode}:${featureType}:${code}`;
        const id = stableUuid(`features:${key}`);
        this.featureIdsByKey.set(key, id);
        this.featureRows.push(Object.assign({ id, source_id: this.getSourceId(sourceCode), created_at: this.now, updated_at: this.now }, row));
        this.registerApi(sourceCode, collection, code, 'features', id, sourceCode, code, row.name);
        return id;
    }
    addSpell(sourceCode, code, row) {
        const key = `${sourceCode}:${code}`;
        const id = stableUuid(`spells:${key}`);
        this.spellIdsByKey.set(key, id);
        this.spellRows.push(Object.assign({ id, source_id: this.getSourceId(sourceCode), created_at: this.now, updated_at: this.now }, row));
        this.registerApi(sourceCode, 'spells', code, 'spells', id, sourceCode, code, row.name);
        return id;
    }
    addItem(sourceCode, code, row, collection) {
        const key = `${sourceCode}:${collection}:${code}`;
        const id = stableUuid(`items:${key}`);
        this.itemIdsByKey.set(key, id);
        this.itemRows.push(Object.assign({ id, source_id: this.getSourceId(sourceCode), created_at: this.now, updated_at: this.now }, row));
        this.registerApi(sourceCode, collection, code, 'items', id, sourceCode, code, row.name);
        return id;
    }
    addActor(sourceCode, code, row, collection) {
        const key = `${sourceCode}:${collection}:${code}`;
        const id = stableUuid(`actors:${key}`);
        this.actorIdsByKey.set(key, id);
        this.actorRows.push(Object.assign({ id, source_id: this.getSourceId(sourceCode), created_at: this.now, updated_at: this.now }, row));
        this.registerApi(sourceCode, collection, code, 'actors', id, sourceCode, code, row.name);
        return id;
    }
    addLink(options) {
        var _a, _b, _c, _d, _e;
        if (options.leftId === options.rightId && options.leftTable === options.rightTable) {
            return;
        }
        const linkKey = [
            options.linkType,
            options.leftTable,
            options.leftId,
            options.rightTable,
            options.rightId,
            (_a = options.relationshipRole) !== null && _a !== void 0 ? _a : '',
        ].join('|');
        if (this.linkKeys.has(linkKey)) {
            return;
        }
        this.linkKeys.add(linkKey);
        this.linkRows.push({
            id: stableUuid(`links:${linkKey}`),
            source_id: this.getSourceId(options.sourceCode),
            link_type: options.linkType,
            left_table: options.leftTable,
            left_id: options.leftId,
            right_table: options.rightTable,
            right_id: options.rightId,
            relationship_role: (_b = options.relationshipRole) !== null && _b !== void 0 ? _b : null,
            sort_order: (_c = options.sortOrder) !== null && _c !== void 0 ? _c : null,
            level_required: (_d = options.levelRequired) !== null && _d !== void 0 ? _d : null,
            quantity: (_e = options.quantity) !== null && _e !== void 0 ? _e : null,
            metadata_json: toJson(options.metadataJson),
            created_at: this.now,
            updated_at: this.now,
        });
    }
    registerApi(year, collection, code, table, id, sourceCode, entityCode, name) {
        const apiKey = buildApiKey(year, collection, code);
        this.registryByApi.set(apiKey, {
            table,
            id,
            sourceId: this.getSourceId(sourceCode),
            sourceCode,
            code: entityCode,
            name,
        });
    }
    resolveUrl(url) {
        var _a;
        const parsed = parseApiPath(url);
        if (!parsed) {
            return null;
        }
        return (_a = this.registryByApi.get(buildApiKey(parsed.year, parsed.collection, parsed.code))) !== null && _a !== void 0 ? _a : null;
    }
    getLookupId(lookupType, code) {
        var _a;
        return (_a = this.lookupIdsByKey.get(`${lookupType}:${code}`)) !== null && _a !== void 0 ? _a : null;
    }
}
function buildApiKey(year, collection, code) {
    return `${year}:${collection}:${code}`;
}
function stableUuid(value) {
    const hash = (0, crypto_1.createHash)('sha1').update(value).digest('hex').slice(0, 32);
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        hash.slice(12, 16),
        hash.slice(16, 20),
        hash.slice(20, 32),
    ].join('-');
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function titleCase(value) {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
function toJson(value) {
    return value === undefined ? null : JSON.stringify(value);
}
function textFromDesc(value) {
    if (typeof value === 'string') {
        return value.trim() || null;
    }
    if (Array.isArray(value)) {
        const joined = value
            .filter((entry) => typeof entry === 'string')
            .map((entry) => String(entry).trim())
            .filter(Boolean)
            .join('\n\n');
        return joined || null;
    }
    return null;
}
function firstSentence(value) {
    if (!value) {
        return null;
    }
    const normalized = value.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/^.*?[.!?](?:\s|$)/);
    return match ? match[0].trim() : normalized;
}
function parseApiPath(url) {
    const match = /^\/api\/(2014|2024)\/([^/]+)\/([^/?#]+)/.exec(url);
    if (!match) {
        return null;
    }
    return {
        year: match[1],
        collection: match[2],
        code: match[3],
    };
}
function readJsonArray(filepath) {
    const value = JSON.parse((0, fs_1.readFileSync)(filepath, 'utf8'));
    if (!Array.isArray(value)) {
        throw new Error(`Expected ${filepath} to contain a JSON array.`);
    }
    return value;
}
function readYearFile(year, filename) {
    return readJsonArray((0, path_1.join)('src', year, filename));
}
function uniqueIds(values) {
    return [...new Set(values.filter((value) => Boolean(value)))];
}
function inferActivationCode(text) {
    if (!text) {
        return null;
    }
    const lower = text.toLowerCase();
    if (lower.includes('bonus action'))
        return 'bonus-action';
    if (lower.includes('reaction'))
        return 'reaction';
    if (lower.includes('action'))
        return 'action';
    if (lower.includes('minute'))
        return 'minute';
    if (lower.includes('hour'))
        return 'hour';
    if (lower.includes('passive'))
        return 'passive';
    return 'special';
}
function inferRestCode(text) {
    if (!text) {
        return null;
    }
    const lower = text.toLowerCase();
    if (lower.includes('short or long rest'))
        return 'short-or-long-rest';
    if (lower.includes('long rest'))
        return 'long-rest';
    if (lower.includes('short rest'))
        return 'short-rest';
    if (lower.includes('per day'))
        return 'per-day';
    if (lower.includes('at will'))
        return 'at-will';
    return null;
}
function lookupCodeFromName(value) {
    return slugify(value);
}
function extractApiReferences(value) {
    const references = [];
    const visit = (current) => {
        if (Array.isArray(current)) {
            for (const entry of current)
                visit(entry);
            return;
        }
        if (!current || typeof current !== 'object') {
            return;
        }
        const objectValue = current;
        if (typeof objectValue.url === 'string' && typeof objectValue.index === 'string') {
            references.push(objectValue);
        }
        for (const child of Object.values(objectValue)) {
            visit(child);
        }
    };
    visit(value);
    return references;
}
function addLinksFromValue(ctx, options) {
    const seenTargets = new Set();
    const references = extractApiReferences(options.value);
    references.forEach((reference, index) => {
        var _a, _b, _c;
        if (typeof reference.url !== 'string') {
            return;
        }
        const resolved = ctx.resolveUrl(reference.url);
        if (!resolved) {
            return;
        }
        const targetKey = `${resolved.table}:${resolved.id}`;
        if (seenTargets.has(targetKey)) {
            return;
        }
        seenTargets.add(targetKey);
        ctx.addLink({
            sourceCode: options.sourceCode,
            linkType: `${singularizeTable(options.leftTable)}_${singularizeTable(resolved.table)}`,
            leftTable: options.leftTable,
            leftId: options.leftId,
            rightTable: resolved.table,
            rightId: resolved.id,
            relationshipRole: options.relationshipRole,
            sortOrder: index + 1,
            levelRequired: (_a = options.levelRequired) !== null && _a !== void 0 ? _a : null,
            quantity: (_b = options.quantity) !== null && _b !== void 0 ? _b : null,
            metadataJson: (_c = options.metadataJson) !== null && _c !== void 0 ? _c : { reference },
        });
    });
}
function singularizeTable(tableName) {
    return tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
}
function getReferenceLookupId(ctx, reference) {
    if (!reference || typeof reference.url !== 'string') {
        return null;
    }
    const resolved = ctx.resolveUrl(reference.url);
    return resolved && resolved.table === 'lookups' ? resolved.id : null;
}
function getReferenceEntityId(ctx, reference) {
    if (!reference || typeof reference.url !== 'string') {
        return null;
    }
    const resolved = ctx.resolveUrl(reference.url);
    return resolved && resolved.table === 'entities' ? resolved.id : null;
}
function moveSpeedToJson(speed) {
    if (typeof speed === 'number') {
        return { walk: speed };
    }
    return speed;
}
function extractArmorClassValue(armorClass) {
    if (typeof armorClass === 'number') {
        return armorClass;
    }
    if (Array.isArray(armorClass)) {
        const first = armorClass[0];
        return typeof (first === null || first === void 0 ? void 0 : first.value) === 'number' ? first.value : null;
    }
    return null;
}
function extractMonsterType(value) {
    if (typeof value === 'string') {
        return { code: lookupCodeFromName(value), name: titleCase(value), details: value };
    }
    if (value && typeof value === 'object') {
        const objectValue = value;
        if (typeof objectValue.type === 'string') {
            return { code: lookupCodeFromName(objectValue.type), name: titleCase(objectValue.type), details: value };
        }
    }
    return null;
}
function extractAbilityScores(monster) {
    return {
        str: monster.strength,
        dex: monster.dexterity,
        con: monster.constitution,
        int: monster.intelligence,
        wis: monster.wisdom,
        cha: monster.charisma,
    };
}
function splitMonsterProficiencies(monster) {
    const proficiencies = Array.isArray(monster.proficiencies) ? monster.proficiencies : [];
    const saves = proficiencies.filter((entry) => { var _a, _b; return String((_b = (_a = entry === null || entry === void 0 ? void 0 : entry.proficiency) === null || _a === void 0 ? void 0 : _a.index) !== null && _b !== void 0 ? _b : '').startsWith('saving-throw-'); });
    const skills = proficiencies.filter((entry) => { var _a, _b; return String((_b = (_a = entry === null || entry === void 0 ? void 0 : entry.proficiency) === null || _a === void 0 ? void 0 : _a.index) !== null && _b !== void 0 ? _b : '').startsWith('skill-'); });
    return { saves, skills };
}
function collectSpellcastingAbilities(monster) {
    const abilities = Array.isArray(monster.special_abilities) ? monster.special_abilities : [];
    return abilities
        .filter((entry) => entry && typeof entry === 'object' && entry.spellcasting)
        .map((entry) => entry.spellcasting);
}
function entityDescriptionFromRace(raw) {
    return [raw.age, raw.alignment, raw.size_description, raw.language_desc]
        .filter((value) => typeof value === 'string' && value.trim())
        .join('\n\n');
}
function entityDescriptionFromSubrace(raw) {
    return textFromDesc(raw.desc);
}
function computeLevelBounds(levels) {
    const numericLevels = levels
        .map((entry) => entry === null || entry === void 0 ? void 0 : entry.level)
        .filter((value) => typeof value === 'number');
    if (numericLevels.length === 0) {
        return { levelMin: null, levelMax: null };
    }
    return { levelMin: Math.min(...numericLevels), levelMax: Math.max(...numericLevels) };
}
function groupLevelsByKey(levels, field) {
    var _a;
    const groups = new Map();
    for (const row of levels) {
        const key = (_a = row === null || row === void 0 ? void 0 : row[field]) === null || _a === void 0 ? void 0 : _a.index;
        if (typeof key !== 'string') {
            continue;
        }
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(row);
    }
    return groups;
}
function insertRows(db, tableName, columns, rows) {
    if (rows.length === 0) {
        return;
    }
    const placeholders = columns.map(() => '?').join(', ');
    const statement = db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);
    db.exec('BEGIN');
    try {
        for (const row of rows) {
            statement.run(...columns.map((column) => (column in row ? row[column] : null)));
        }
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    finally {
        const disposable = statement;
        if (typeof disposable[Symbol.dispose] === 'function') {
            disposable[Symbol.dispose]();
        }
    }
}
function seedSources(ctx) {
    const licenseName = 'Open Gaming License Version 1.0a';
    const licenseUrl = 'https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f';
    ctx.addSource('system', 'System Reference Catalog', null, null, null);
    ctx.addSource('2014', 'D&D 5e SRD (2014)', 'Wizards of the Coast', licenseName, licenseUrl);
    ctx.addSource('2024', 'D&D 5e SRD (2024)', 'Wizards of the Coast', licenseName, licenseUrl);
}
function seedManualLookups(ctx) {
    const sizes = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
    const currencies = ['cp', 'sp', 'ep', 'gp', 'pp'];
    const activations = [
        ['action', 'Action'],
        ['bonus-action', 'Bonus Action'],
        ['reaction', 'Reaction'],
        ['minute', 'Minute'],
        ['hour', 'Hour'],
        ['passive', 'Passive'],
        ['special', 'Special'],
    ];
    const rests = [
        ['short-rest', 'Short Rest'],
        ['long-rest', 'Long Rest'],
        ['short-or-long-rest', 'Short or Long Rest'],
        ['per-day', 'Per Day'],
        ['at-will', 'At Will'],
    ];
    const rarities = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'];
    sizes.forEach((name, index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'size',
            code: lookupCodeFromName(name),
            name,
            sortOrder: index + 1,
        });
    });
    currencies.forEach((code, index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'currency',
            code,
            name: code.toUpperCase(),
            sortOrder: index + 1,
        });
    });
    activations.forEach(([code, name], index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'activation',
            code,
            name,
            sortOrder: index + 1,
        });
    });
    rests.forEach(([code, name], index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'rest',
            code,
            name,
            sortOrder: index + 1,
        });
    });
    rarities.forEach((name, index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'rarity',
            code: lookupCodeFromName(name),
            name,
            sortOrder: index + 1,
        });
    });
    ctx.addLookup({
        sourceCode: 'system',
        lookupType: 'item_type',
        code: 'magic-item',
        name: 'Magic Item',
    });
}
function addLookupCollection(ctx, sourceCode, filename, collection, lookupType, options) {
    const records = readYearFile(sourceCode, filename);
    records.forEach((record, index) => {
        const name = (options === null || options === void 0 ? void 0 : options.getName) ? options.getName(record) : record.name;
        ctx.addLookup({
            sourceCode,
            lookupType,
            code: record.index,
            name,
            parentLookupId: (options === null || options === void 0 ? void 0 : options.getParentLookupId) ? options.getParentLookupId(record) : null,
            sortOrder: index + 1,
            numericValue: (options === null || options === void 0 ? void 0 : options.getNumericValue) ? options.getNumericValue(record) : null,
            textValue: (options === null || options === void 0 ? void 0 : options.getTextValue) ? options.getTextValue(record) : null,
            jsonValue: record,
            description: (options === null || options === void 0 ? void 0 : options.getDescription) ? options.getDescription(record) : null,
            register: [{ year: sourceCode, collection, code: record.index }],
        });
    });
    return records;
}
function seedLookupRows(ctx) {
    addLookupCollection(ctx, '2014', '5e-SRD-Ability-Scores.json', 'ability-scores', 'ability', {
        getName: (record) => record.full_name || record.name,
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Ability-Scores.json', 'ability-scores', 'ability', {
        getName: (record) => record.full_name || record.name,
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Alignments.json', 'alignments', 'alignment', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.desc) !== null && _a !== void 0 ? _a : record.description); },
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Alignments.json', 'alignments', 'alignment', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Damage-Types.json', 'damage-types', 'damage_type', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Damage-Types.json', 'damage-types', 'damage_type', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Conditions.json', 'conditions', 'condition', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Conditions.json', 'conditions', 'condition', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Languages.json', 'languages', 'language', {
        getDescription: (record) => textFromDesc(record.desc),
        getTextValue: (record) => { var _a; return (_a = record.type) !== null && _a !== void 0 ? _a : null; },
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Languages.json', 'languages', 'language', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
        getTextValue: (record) => { var _a; return (_a = record.type) !== null && _a !== void 0 ? _a : null; },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Skills.json', 'skills', 'skill', {
        getDescription: (record) => textFromDesc(record.desc),
        getParentLookupId: (record) => getReferenceLookupId(ctx, record.ability_score),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Skills.json', 'skills', 'skill', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
        getParentLookupId: (record) => getReferenceLookupId(ctx, record.ability_score),
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Magic-Schools.json', 'magic-schools', 'school', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Magic-Schools.json', 'magic-schools', 'school', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Equipment-Categories.json', 'equipment-categories', 'item_type');
    addLookupCollection(ctx, '2024', '5e-SRD-Equipment-Categories.json', 'equipment-categories', 'item_type');
    addLookupCollection(ctx, '2014', '5e-SRD-Proficiencies.json', 'proficiencies', 'proficiency', {
        getParentLookupId: (record) => getReferenceLookupId(ctx, record.reference),
        getTextValue: (record) => (typeof record.type === 'string' ? record.type : null),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Proficiencies.json', 'proficiencies', 'proficiency', {
        getParentLookupId: (record) => getReferenceLookupId(ctx, record.reference),
        getTextValue: (record) => (typeof record.type === 'string' ? record.type : null),
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Weapon-Properties.json', 'weapon-properties', 'weapon_property', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Weapon-Properties.json', 'weapon-properties', 'weapon_property', {
        getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); },
    });
    addLookupCollection(ctx, '2024', '5e-SRD-Weapon-Mastery-Properties.json', 'weapon-mastery-properties', 'weapon_mastery_property', { getDescription: (record) => { var _a; return textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc); } });
    addLookupCollection(ctx, '2014', '5e-SRD-Rules.json', 'rules', 'rule', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    addLookupCollection(ctx, '2014', '5e-SRD-Rule-Sections.json', 'rule-sections', 'rule_section', {
        getDescription: (record) => textFromDesc(record.desc),
    });
    const taxonomyValues = new Set();
    readYearFile('2014', '5e-SRD-Monsters.json').forEach((monster) => {
        const taxonomy = extractMonsterType(monster.type);
        if (taxonomy) {
            taxonomyValues.add(taxonomy.name);
        }
    });
    readYearFile('2024', '5e-SRD-Species.json').forEach((species) => {
        if (typeof species.type === 'string') {
            taxonomyValues.add(titleCase(species.type));
        }
    });
    [...taxonomyValues].sort().forEach((name, index) => {
        ctx.addLookup({
            sourceCode: 'system',
            lookupType: 'taxonomy',
            code: lookupCodeFromName(name),
            name,
            sortOrder: index + 1,
        });
    });
    const classLevels = readYearFile('2014', '5e-SRD-Levels.json');
    return {
        classProgression: groupLevelsByKey(classLevels, 'class'),
        subclassProgression: groupLevelsByKey(classLevels, 'subclass'),
    };
}
function resolveLookupIds(ctx, references) {
    if (!Array.isArray(references)) {
        return [];
    }
    return uniqueIds(references.map((reference) => getReferenceLookupId(ctx, reference)).filter(Boolean));
}
function seedEntities(ctx, classProgression, subclassProgression) {
    const classes = readYearFile('2014', '5e-SRD-Classes.json');
    const subclasses = readYearFile('2014', '5e-SRD-Subclasses.json');
    const backgrounds2014 = readYearFile('2014', '5e-SRD-Backgrounds.json');
    const backgrounds2024 = readYearFile('2024', '5e-SRD-Backgrounds.json');
    const races = readYearFile('2014', '5e-SRD-Races.json');
    const subraces = readYearFile('2014', '5e-SRD-Subraces.json');
    const species = readYearFile('2024', '5e-SRD-Species.json');
    const subspecies = readYearFile('2024', '5e-SRD-Subspecies.json');
    classes.forEach((record) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const levels = (_a = classProgression.get(record.index)) !== null && _a !== void 0 ? _a : [];
        const bounds = computeLevelBounds(levels);
        const spellcastingAbilityId = getReferenceLookupId(ctx, (_b = record.spellcasting) === null || _b === void 0 ? void 0 : _b.spellcasting_ability);
        const primaryLookupIds = uniqueIds([
            ...resolveLookupIds(ctx, record.saving_throws),
            spellcastingAbilityId,
        ]);
        const grantedLookupIds = uniqueIds(resolveLookupIds(ctx, record.proficiencies));
        const entityId = ctx.addEntity('2014', 'class', record.index, {
            entity_type: 'class',
            parent_entity_id: null,
            slug: `2014-class-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: spellcastingAbilityId,
            hit_die: (_c = record.hit_die) !== null && _c !== void 0 ? _c : null,
            level_min: bounds.levelMin,
            level_max: bounds.levelMax,
            primary_lookup_ids: toJson(primaryLookupIds),
            granted_lookup_ids: toJson(grantedLookupIds),
            movement_json: null,
            prerequisite_json: toJson((_e = (_d = record.multi_classing) === null || _d === void 0 ? void 0 : _d.prerequisites) !== null && _e !== void 0 ? _e : null),
            choice_rules_json: toJson({
                proficiency_choices: (_f = record.proficiency_choices) !== null && _f !== void 0 ? _f : [],
                starting_equipment_options: (_g = record.starting_equipment_options) !== null && _g !== void 0 ? _g : [],
            }),
            stats_json: toJson({
                raw: record,
                progression: levels,
                spellcasting: (_h = record.spellcasting) !== null && _h !== void 0 ? _h : null,
            }),
            tags_json: toJson({ year: '2014', collection: 'classes' }),
            description: textFromDesc((_j = record.spellcasting) === null || _j === void 0 ? void 0 : _j.info),
            srd: true,
            is_homebrew: false,
        }, 'classes');
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'primary',
            value: record.saving_throws,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.proficiencies,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.starting_equipment,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'options',
            value: record.starting_equipment_options,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'options',
            value: record.proficiency_choices,
        });
    });
    subclasses.forEach((record) => {
        var _a;
        const levels = (_a = subclassProgression.get(record.index)) !== null && _a !== void 0 ? _a : [];
        const bounds = computeLevelBounds(levels);
        const parentEntityId = getReferenceEntityId(ctx, record.class);
        const entityId = ctx.addEntity('2014', 'subclass', record.index, {
            entity_type: 'subclass',
            parent_entity_id: parentEntityId,
            slug: `2014-subclass-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: bounds.levelMin,
            level_max: bounds.levelMax,
            primary_lookup_ids: null,
            granted_lookup_ids: null,
            movement_json: null,
            prerequisite_json: null,
            choice_rules_json: null,
            stats_json: toJson({ raw: record, progression: levels }),
            tags_json: toJson({ year: '2014', collection: 'subclasses', flavor: record.subclass_flavor }),
            description: textFromDesc(record.desc),
            srd: true,
            is_homebrew: false,
        }, 'subclasses');
        if (parentEntityId) {
            ctx.addLink({
                sourceCode: '2014',
                linkType: 'entity_entity',
                leftTable: 'entities',
                leftId: parentEntityId,
                rightTable: 'entities',
                rightId: entityId,
                relationshipRole: 'contains',
            });
        }
    });
    backgrounds2014.forEach((record) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const grantedLookupIds = uniqueIds(resolveLookupIds(ctx, record.starting_proficiencies));
        const entityId = ctx.addEntity('2014', 'background', record.index, {
            entity_type: 'background',
            parent_entity_id: null,
            slug: `2014-background-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: null,
            granted_lookup_ids: toJson(grantedLookupIds),
            movement_json: null,
            prerequisite_json: null,
            choice_rules_json: toJson({
                language_options: (_a = record.language_options) !== null && _a !== void 0 ? _a : null,
                personality_traits: (_b = record.personality_traits) !== null && _b !== void 0 ? _b : null,
                ideals: (_c = record.ideals) !== null && _c !== void 0 ? _c : null,
                bonds: (_d = record.bonds) !== null && _d !== void 0 ? _d : null,
                flaws: (_e = record.flaws) !== null && _e !== void 0 ? _e : null,
                starting_equipment_options: (_f = record.starting_equipment_options) !== null && _f !== void 0 ? _f : [],
            }),
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'backgrounds' }),
            description: textFromDesc((_g = record.feature) === null || _g === void 0 ? void 0 : _g.desc),
            srd: true,
            is_homebrew: false,
        }, 'backgrounds');
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.starting_proficiencies,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.starting_equipment,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'options',
            value: record.starting_equipment_options,
        });
    });
    backgrounds2024.forEach((record) => {
        var _a;
        const entityId = ctx.addEntity('2024', 'background', record.index, {
            entity_type: 'background',
            parent_entity_id: null,
            slug: `2024-background-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: toJson(uniqueIds(resolveLookupIds(ctx, record.ability_scores))),
            granted_lookup_ids: toJson(uniqueIds(resolveLookupIds(ctx, record.proficiencies))),
            movement_json: null,
            prerequisite_json: null,
            choice_rules_json: toJson({ equipment_options: (_a = record.equipment_options) !== null && _a !== void 0 ? _a : [] }),
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2024', collection: 'backgrounds' }),
            description: null,
            srd: true,
            is_homebrew: false,
        }, 'backgrounds');
        addLinksFromValue(ctx, {
            sourceCode: '2024',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'primary',
            value: record.ability_scores,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2024',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.proficiencies,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2024',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'options',
            value: record.equipment_options,
        });
    });
    races.forEach((record) => {
        const entityId = ctx.addEntity('2014', 'ancestry', record.index, {
            entity_type: 'ancestry',
            parent_entity_id: null,
            slug: `2014-ancestry-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: typeof record.size === 'string' ? ctx.getLookupId('size', lookupCodeFromName(record.size)) : null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: toJson(uniqueIds(resolveLookupIds(ctx, record.ability_bonuses))),
            granted_lookup_ids: toJson(uniqueIds(resolveLookupIds(ctx, record.languages))),
            movement_json: toJson(moveSpeedToJson(record.speed)),
            prerequisite_json: null,
            choice_rules_json: null,
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'races' }),
            description: entityDescriptionFromRace(record),
            srd: true,
            is_homebrew: false,
        }, 'races');
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'primary',
            value: record.ability_bonuses,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.languages,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.traits,
        });
    });
    subraces.forEach((record) => {
        const parentEntityId = getReferenceEntityId(ctx, record.race);
        const entityId = ctx.addEntity('2014', 'ancestry', record.index, {
            entity_type: 'ancestry',
            parent_entity_id: parentEntityId,
            slug: `2014-ancestry-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: toJson(uniqueIds(resolveLookupIds(ctx, record.ability_bonuses))),
            granted_lookup_ids: null,
            movement_json: null,
            prerequisite_json: null,
            choice_rules_json: null,
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'subraces' }),
            description: entityDescriptionFromSubrace(record),
            srd: true,
            is_homebrew: false,
        }, 'subraces');
        if (parentEntityId) {
            ctx.addLink({
                sourceCode: '2014',
                linkType: 'entity_entity',
                leftTable: 'entities',
                leftId: parentEntityId,
                rightTable: 'entities',
                rightId: entityId,
                relationshipRole: 'contains',
            });
        }
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'primary',
            value: record.ability_bonuses,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.racial_traits,
        });
    });
    species.forEach((record) => {
        const entityId = ctx.addEntity('2024', 'ancestry', record.index, {
            entity_type: 'ancestry',
            parent_entity_id: null,
            slug: `2024-ancestry-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: typeof record.size === 'string' ? ctx.getLookupId('size', lookupCodeFromName(record.size)) : null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: null,
            granted_lookup_ids: null,
            movement_json: toJson(moveSpeedToJson(record.speed)),
            prerequisite_json: null,
            choice_rules_json: null,
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2024', collection: 'species', type: record.type }),
            description: null,
            srd: true,
            is_homebrew: false,
        }, 'species');
        addLinksFromValue(ctx, {
            sourceCode: '2024',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.traits,
        });
    });
    subspecies.forEach((record) => {
        const parentEntityId = getReferenceEntityId(ctx, record.species);
        const damageTypeLookupId = typeof record.damage_type === 'string'
            ? ctx.getLookupId('damage_type', lookupCodeFromName(record.damage_type))
            : null;
        const entityId = ctx.addEntity('2024', 'ancestry', record.index, {
            entity_type: 'ancestry',
            parent_entity_id: parentEntityId,
            slug: `2024-ancestry-${record.index}`,
            code: record.index,
            name: record.name,
            size_lookup_id: null,
            spellcasting_ability_lookup_id: null,
            hit_die: null,
            level_min: null,
            level_max: null,
            primary_lookup_ids: damageTypeLookupId ? toJson([damageTypeLookupId]) : null,
            granted_lookup_ids: null,
            movement_json: null,
            prerequisite_json: null,
            choice_rules_json: null,
            stats_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2024', collection: 'subspecies' }),
            description: null,
            srd: true,
            is_homebrew: false,
        }, 'subspecies');
        if (parentEntityId) {
            ctx.addLink({
                sourceCode: '2024',
                linkType: 'entity_entity',
                leftTable: 'entities',
                leftId: parentEntityId,
                rightTable: 'entities',
                rightId: entityId,
                relationshipRole: 'contains',
            });
        }
        addLinksFromValue(ctx, {
            sourceCode: '2024',
            leftTable: 'entities',
            leftId: entityId,
            relationshipRole: 'grants',
            value: record.traits,
        });
    });
}
function seedFeatures(ctx) {
    const features2014 = readYearFile('2014', '5e-SRD-Features.json');
    const traits2014 = readYearFile('2014', '5e-SRD-Traits.json');
    const feats2014 = readYearFile('2014', '5e-SRD-Feats.json');
    const backgrounds2014 = readYearFile('2014', '5e-SRD-Backgrounds.json');
    const traits2024 = readYearFile('2024', '5e-SRD-Traits.json');
    const feats2024 = readYearFile('2024', '5e-SRD-Feats.json');
    const backgrounds2024 = readYearFile('2024', '5e-SRD-Backgrounds.json');
    features2014.forEach((record) => {
        var _a, _b, _c, _d, _e;
        const description = textFromDesc(record.desc) || record.name;
        const featureType = record.subclass ? 'subclass_feature' : 'class_feature';
        const activationCode = inferActivationCode(description);
        const restCode = inferRestCode(description);
        const featureId = ctx.addFeature('2014', featureType, record.index, {
            feature_type: featureType,
            slug: `2014-feature-${record.index}`,
            code: record.index,
            name: record.name,
            level_required: (_a = record.level) !== null && _a !== void 0 ? _a : null,
            activation_lookup_id: activationCode ? ctx.getLookupId('activation', activationCode) : null,
            rest_lookup_id: restCode ? ctx.getLookupId('rest', restCode) : null,
            repeatable: false,
            requires_choice: Boolean(record.feature_specific),
            prerequisite_json: toJson((_b = record.prerequisites) !== null && _b !== void 0 ? _b : null),
            choice_options_json: toJson((_c = record.feature_specific) !== null && _c !== void 0 ? _c : null),
            uses_json: null,
            effects_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'features' }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'features');
        const ownerId = record.subclass
            ? getReferenceEntityId(ctx, record.subclass)
            : getReferenceEntityId(ctx, record.class);
        if (ownerId) {
            ctx.addLink({
                sourceCode: '2014',
                linkType: 'entity_feature',
                leftTable: 'entities',
                leftId: ownerId,
                rightTable: 'features',
                rightId: featureId,
                relationshipRole: 'grants',
                levelRequired: (_d = record.level) !== null && _d !== void 0 ? _d : null,
            });
        }
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'features',
            leftId: featureId,
            relationshipRole: 'requires',
            value: record.prerequisites,
            levelRequired: (_e = record.level) !== null && _e !== void 0 ? _e : null,
        });
    });
    backgrounds2014.forEach((record) => {
        const feature = record.feature;
        if (!feature || typeof feature.name !== 'string') {
            return;
        }
        const description = textFromDesc(feature.desc) || feature.name;
        const featureId = ctx.addFeature('2014', 'background_feature', `background-${record.index}`, {
            feature_type: 'background_feature',
            slug: `2014-background-feature-${record.index}`,
            code: `background-${record.index}`,
            name: feature.name,
            level_required: null,
            activation_lookup_id: null,
            rest_lookup_id: null,
            repeatable: false,
            requires_choice: false,
            prerequisite_json: null,
            choice_options_json: null,
            uses_json: null,
            effects_json: toJson({ raw: feature, background: record.index }),
            tags_json: toJson({ year: '2014', collection: 'backgrounds' }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'backgrounds');
        const ownerId = getReferenceEntityId(ctx, record);
        if (ownerId) {
            ctx.addLink({
                sourceCode: '2014',
                linkType: 'entity_feature',
                leftTable: 'entities',
                leftId: ownerId,
                rightTable: 'features',
                rightId: featureId,
                relationshipRole: 'grants',
            });
        }
    });
    traits2014.forEach((record) => {
        var _a, _b;
        const description = textFromDesc(record.desc) || record.name;
        const activationCode = inferActivationCode(description);
        const restCode = inferRestCode(description);
        const featureId = ctx.addFeature('2014', 'ancestry_trait', record.index, {
            feature_type: 'ancestry_trait',
            slug: `2014-trait-${record.index}`,
            code: record.index,
            name: record.name,
            level_required: null,
            activation_lookup_id: activationCode ? ctx.getLookupId('activation', activationCode) : null,
            rest_lookup_id: restCode ? ctx.getLookupId('rest', restCode) : null,
            repeatable: false,
            requires_choice: false,
            prerequisite_json: null,
            choice_options_json: null,
            uses_json: null,
            effects_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'traits' }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'traits');
        [...((_a = record.races) !== null && _a !== void 0 ? _a : []), ...((_b = record.subraces) !== null && _b !== void 0 ? _b : [])].forEach((ownerReference) => {
            const ownerId = getReferenceEntityId(ctx, ownerReference);
            if (!ownerId) {
                return;
            }
            ctx.addLink({
                sourceCode: '2014',
                linkType: 'entity_feature',
                leftTable: 'entities',
                leftId: ownerId,
                rightTable: 'features',
                rightId: featureId,
                relationshipRole: 'grants',
            });
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'features',
            leftId: featureId,
            relationshipRole: 'grants',
            value: record.proficiencies,
        });
    });
    traits2024.forEach((record) => {
        var _a;
        const description = textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc) || record.name;
        const activationCode = inferActivationCode(description);
        const restCode = inferRestCode(description);
        const featureId = ctx.addFeature('2024', 'ancestry_trait', record.index, {
            feature_type: 'ancestry_trait',
            slug: `2024-trait-${record.index}`,
            code: record.index,
            name: record.name,
            level_required: null,
            activation_lookup_id: activationCode ? ctx.getLookupId('activation', activationCode) : null,
            rest_lookup_id: restCode ? ctx.getLookupId('rest', restCode) : null,
            repeatable: false,
            requires_choice: false,
            prerequisite_json: null,
            choice_options_json: null,
            uses_json: null,
            effects_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2024', collection: 'traits' }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'traits');
        (Array.isArray(record.species) ? record.species : record.species ? [record.species] : []).forEach((ownerReference) => {
            const ownerId = getReferenceEntityId(ctx, ownerReference);
            if (!ownerId) {
                return;
            }
            ctx.addLink({
                sourceCode: '2024',
                linkType: 'entity_feature',
                leftTable: 'entities',
                leftId: ownerId,
                rightTable: 'features',
                rightId: featureId,
                relationshipRole: 'grants',
            });
        });
    });
    feats2014.forEach((record) => {
        var _a;
        const description = textFromDesc(record.desc) || record.name;
        const featureId = ctx.addFeature('2014', 'feat', record.index, {
            feature_type: 'feat',
            slug: `2014-feat-${record.index}`,
            code: record.index,
            name: record.name,
            level_required: null,
            activation_lookup_id: null,
            rest_lookup_id: null,
            repeatable: false,
            requires_choice: false,
            prerequisite_json: toJson((_a = record.prerequisites) !== null && _a !== void 0 ? _a : null),
            choice_options_json: null,
            uses_json: null,
            effects_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2014', collection: 'feats' }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'feats');
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'features',
            leftId: featureId,
            relationshipRole: 'requires',
            value: record.prerequisites,
        });
    });
    feats2024.forEach((record) => {
        var _a, _b, _c;
        const description = textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc) || record.name;
        const activationCode = inferActivationCode(description);
        const restCode = inferRestCode(description);
        ctx.addFeature('2024', 'feat', record.index, {
            feature_type: 'feat',
            slug: `2024-feat-${record.index}`,
            code: record.index,
            name: record.name,
            level_required: null,
            activation_lookup_id: activationCode ? ctx.getLookupId('activation', activationCode) : null,
            rest_lookup_id: restCode ? ctx.getLookupId('rest', restCode) : null,
            repeatable: Boolean(record.repeatable),
            requires_choice: description.toLowerCase().includes('choose '),
            prerequisite_json: toJson((_b = record.prerequisites) !== null && _b !== void 0 ? _b : null),
            choice_options_json: null,
            uses_json: record.repeatable ? toJson({ repeatable: record.repeatable }) : null,
            effects_json: toJson({ raw: record }),
            tags_json: toJson({ year: '2024', collection: 'feats', feat_type: (_c = record.type) !== null && _c !== void 0 ? _c : null }),
            description,
            short_description: firstSentence(description),
            srd: true,
            is_homebrew: false,
        }, 'feats');
    });
    backgrounds2024.forEach((record) => {
        const ownerId = getReferenceEntityId(ctx, record);
        const featEntry = record.feat && typeof record.feat.url === 'string' ? ctx.resolveUrl(record.feat.url) : null;
        if (!ownerId || !featEntry || featEntry.table !== 'features') {
            return;
        }
        ctx.addLink({
            sourceCode: '2024',
            linkType: 'entity_feature',
            leftTable: 'entities',
            leftId: ownerId,
            rightTable: 'features',
            rightId: featEntry.id,
            relationshipRole: 'grants',
            metadataJson: record.feat.note ? { note: record.feat.note } : null,
        });
    });
}
function seedSpells(ctx) {
    const spells2014 = readYearFile('2014', '5e-SRD-Spells.json');
    spells2014.forEach((record) => {
        var _a, _b, _c, _d, _e, _f;
        const description = textFromDesc(record.desc) || record.name;
        const schoolLookupId = getReferenceLookupId(ctx, record.school);
        if (!schoolLookupId) {
            throw new Error(`Missing school lookup for spell ${record.index}`);
        }
        const components = Array.isArray(record.components) ? record.components : [];
        const activationCode = inferActivationCode(textFromDesc(record.casting_time));
        const spellId = ctx.addSpell('2014', record.index, {
            slug: `2014-spell-${record.index}`,
            code: record.index,
            name: record.name,
            level: typeof record.level === 'number' ? record.level : 0,
            school_lookup_id: schoolLookupId,
            activation_lookup_id: activationCode ? ctx.getLookupId('activation', activationCode) : null,
            casting_time: typeof record.casting_time === 'string' ? record.casting_time : 'Special',
            range_text: typeof record.range === 'string' ? record.range : 'Self',
            duration_text: typeof record.duration === 'string' ? record.duration : 'Instantaneous',
            save_ability_lookup_id: getReferenceLookupId(ctx, (_a = record.dc) === null || _a === void 0 ? void 0 : _a.dc_type),
            ritual: Boolean(record.ritual),
            concentration: Boolean(record.concentration),
            verbal: components.includes('V'),
            somatic: components.includes('S'),
            material: components.includes('M'),
            material_description: typeof record.material === 'string' ? record.material : null,
            attack_type: typeof record.attack_type === 'string' ? record.attack_type : null,
            components_json: toJson(components),
            damage_json: toJson((_b = record.damage) !== null && _b !== void 0 ? _b : null),
            scaling_json: toJson({
                higher_level: (_c = record.higher_level) !== null && _c !== void 0 ? _c : null,
                heal_at_slot_level: (_d = record.heal_at_slot_level) !== null && _d !== void 0 ? _d : null,
            }),
            tags_json: toJson({ year: '2014', collection: 'spells' }),
            description,
            higher_level_text: textFromDesc(record.higher_level),
            srd: true,
            is_homebrew: false,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'spells',
            leftId: spellId,
            relationshipRole: 'learns',
            value: record.classes,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'spells',
            leftId: spellId,
            relationshipRole: 'learns',
            value: record.subclasses,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'spells',
            leftId: spellId,
            relationshipRole: 'deals',
            value: ((_e = record.damage) === null || _e === void 0 ? void 0 : _e.damage_type) ? [record.damage.damage_type] : [],
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'spells',
            leftId: spellId,
            relationshipRole: 'targets-save',
            value: ((_f = record.dc) === null || _f === void 0 ? void 0 : _f.dc_type) ? [record.dc.dc_type] : [],
        });
    });
}
function inferItemLookupIds(ctx, sourceCode, record, collection) {
    if (collection === 'magic-items') {
        return {
            itemTypeLookupId: ctx.getLookupId('item_type', 'magic-item'),
            equipmentSlotLookupId: getReferenceLookupId(ctx, record.equipment_category),
        };
    }
    const categories = Array.isArray(record.equipment_categories)
        ? record.equipment_categories
        : record.equipment_category
            ? [record.equipment_category]
            : [];
    const firstLookupId = getReferenceLookupId(ctx, categories[0]);
    return {
        itemTypeLookupId: firstLookupId,
        equipmentSlotLookupId: sourceCode === '2024' && categories.length > 1 ? getReferenceLookupId(ctx, categories[1]) : null,
    };
}
function isConsumableItem(record, collection) {
    var _a, _b, _c;
    const name = typeof record.name === 'string' ? record.name.toLowerCase() : '';
    const firstDescriptionLine = (_c = (_b = textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc)) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== null && _c !== void 0 ? _c : '';
    return (collection === 'magic-items' &&
        (name.includes('potion') || firstDescriptionLine.includes('potion')) ||
        name.includes('acid') ||
        name.includes("alchemist's fire") ||
        name.includes('ammunition'));
}
function seedItems(ctx) {
    const equipment2014 = readYearFile('2014', '5e-SRD-Equipment.json');
    const magicItems2014 = readYearFile('2014', '5e-SRD-Magic-Items.json');
    const equipment2024 = readYearFile('2024', '5e-SRD-Equipment.json');
    const seedItemCollection = (sourceCode, collection, records) => {
        records.forEach((record) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
            const { itemTypeLookupId, equipmentSlotLookupId } = inferItemLookupIds(ctx, sourceCode, record, collection);
            if (!itemTypeLookupId) {
                throw new Error(`Missing item type lookup for ${sourceCode}/${collection}/${record.index}`);
            }
            const description = textFromDesc((_a = record.description) !== null && _a !== void 0 ? _a : record.desc);
            const rarityCode = typeof ((_b = record.rarity) === null || _b === void 0 ? void 0 : _b.name) === 'string' ? lookupCodeFromName(record.rarity.name) : null;
            const costUnit = typeof ((_c = record.cost) === null || _c === void 0 ? void 0 : _c.unit) === 'string' ? record.cost.unit.toLowerCase() : null;
            const itemId = ctx.addItem(sourceCode, record.index, {
                slug: `${sourceCode}-item-${record.index}`,
                code: record.index,
                name: record.name,
                item_type_lookup_id: itemTypeLookupId,
                equipment_slot_lookup_id: equipmentSlotLookupId,
                rarity_lookup_id: rarityCode ? ctx.getLookupId('rarity', rarityCode) : null,
                cost_currency_lookup_id: costUnit ? ctx.getLookupId('currency', costUnit) : null,
                weight_lb: typeof record.weight === 'number' ? record.weight : null,
                cost_amount: typeof ((_d = record.cost) === null || _d === void 0 ? void 0 : _d.quantity) === 'number' ? record.cost.quantity : null,
                is_magical: collection === 'magic-items',
                requires_attunement: collection === 'magic-items' &&
                    ((_e = description === null || description === void 0 ? void 0 : description.toLowerCase().includes('requires attunement')) !== null && _e !== void 0 ? _e : false),
                stackable: collection !== 'magic-items',
                consumable: isConsumableItem(record, collection),
                tags_json: toJson({
                    year: sourceCode,
                    collection,
                    categories: (_g = (_f = record.equipment_categories) !== null && _f !== void 0 ? _f : record.equipment_category) !== null && _g !== void 0 ? _g : null,
                }),
                properties_json: toJson({
                    properties: (_h = record.properties) !== null && _h !== void 0 ? _h : null,
                    variants: (_j = record.variants) !== null && _j !== void 0 ? _j : null,
                    mastery: (_k = record.mastery) !== null && _k !== void 0 ? _k : null,
                }),
                profile_json: toJson({ raw: record }),
                description,
                srd: true,
                is_homebrew: false,
            }, collection);
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'items',
                leftId: itemId,
                relationshipRole: 'belongs-to',
                value: (_m = (_l = record.equipment_categories) !== null && _l !== void 0 ? _l : record.equipment_category) !== null && _m !== void 0 ? _m : [],
            });
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'items',
                leftId: itemId,
                relationshipRole: 'has-property',
                value: (_o = record.properties) !== null && _o !== void 0 ? _o : [],
            });
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'items',
                leftId: itemId,
                relationshipRole: 'deals',
                value: ((_p = record.damage) === null || _p === void 0 ? void 0 : _p.damage_type) ? [record.damage.damage_type] : [],
            });
        });
    };
    seedItemCollection('2014', 'equipment', equipment2014);
    seedItemCollection('2014', 'magic-items', magicItems2014);
    seedItemCollection('2024', 'equipment', equipment2024);
}
function seedActors(ctx) {
    const monsters2014 = readYearFile('2014', '5e-SRD-Monsters.json');
    monsters2014.forEach((record) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const taxonomy = extractMonsterType(record.type);
        const alignmentCode = typeof record.alignment === 'string' ? lookupCodeFromName(record.alignment) : null;
        const { saves, skills } = splitMonsterProficiencies(record);
        const spellcasting = collectSpellcastingAbilities(record);
        const actorId = ctx.addActor('2014', record.index, {
            slug: `2014-actor-${record.index}`,
            code: record.index,
            name: record.name,
            actor_type: (taxonomy === null || taxonomy === void 0 ? void 0 : taxonomy.code) === 'beast' ? 'beast' : 'monster',
            parent_actor_id: null,
            taxonomy_lookup_id: taxonomy ? ctx.getLookupId('taxonomy', taxonomy.code) : null,
            size_lookup_id: typeof record.size === 'string' ? ctx.getLookupId('size', lookupCodeFromName(record.size)) : null,
            alignment_lookup_id: alignmentCode ? ctx.getLookupId('alignment', alignmentCode) : null,
            challenge_rating: typeof record.challenge_rating === 'number' ? record.challenge_rating : Number(record.challenge_rating),
            proficiency_bonus: typeof record.proficiency_bonus === 'number' ? record.proficiency_bonus : null,
            armor_class: extractArmorClassValue(record.armor_class),
            hit_points: typeof record.hit_points === 'number' ? record.hit_points : null,
            hit_dice: typeof record.hit_dice === 'string' ? record.hit_dice : null,
            initiative_bonus: null,
            passive_perception: typeof ((_a = record.senses) === null || _a === void 0 ? void 0 : _a.passive_perception) === 'number' ? record.senses.passive_perception : null,
            abilities_json: toJson(extractAbilityScores(record)),
            saves_json: toJson(saves),
            skills_json: toJson(skills),
            movement_json: toJson((_b = record.speed) !== null && _b !== void 0 ? _b : null),
            senses_json: toJson((_c = record.senses) !== null && _c !== void 0 ? _c : null),
            languages_json: toJson((_d = record.languages) !== null && _d !== void 0 ? _d : null),
            immunities_json: toJson({
                damage: (_e = record.damage_immunities) !== null && _e !== void 0 ? _e : [],
                conditions: (_f = record.condition_immunities) !== null && _f !== void 0 ? _f : [],
            }),
            resistances_json: toJson((_g = record.damage_resistances) !== null && _g !== void 0 ? _g : []),
            vulnerabilities_json: toJson((_h = record.damage_vulnerabilities) !== null && _h !== void 0 ? _h : []),
            conditions_json: toJson((_j = record.condition_immunities) !== null && _j !== void 0 ? _j : []),
            traits_json: toJson((_k = record.special_abilities) !== null && _k !== void 0 ? _k : []),
            actions_json: toJson({
                actions: (_l = record.actions) !== null && _l !== void 0 ? _l : [],
                legendary_actions: (_m = record.legendary_actions) !== null && _m !== void 0 ? _m : [],
            }),
            spellcasting_json: toJson(spellcasting),
            inventory_json: null,
            description: null,
            srd: true,
            is_homebrew: false,
        }, 'monsters');
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'actors',
            leftId: actorId,
            relationshipRole: 'proficient-in',
            value: record.proficiencies,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'actors',
            leftId: actorId,
            relationshipRole: 'immune-to',
            value: record.condition_immunities,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'actors',
            leftId: actorId,
            relationshipRole: 'immune-to',
            value: record.damage_immunities,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'actors',
            leftId: actorId,
            relationshipRole: 'resists',
            value: record.damage_resistances,
        });
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'actors',
            leftId: actorId,
            relationshipRole: 'vulnerable-to',
            value: record.damage_vulnerabilities,
        });
        spellcasting.forEach((entry) => {
            var _a;
            addLinksFromValue(ctx, {
                sourceCode: '2014',
                leftTable: 'actors',
                leftId: actorId,
                relationshipRole: 'casts',
                value: (_a = entry.spells) !== null && _a !== void 0 ? _a : [],
            });
        });
    });
}
function seedRuleLinks(ctx) {
    const rules2014 = readYearFile('2014', '5e-SRD-Rules.json');
    const abilityScores2014 = readYearFile('2014', '5e-SRD-Ability-Scores.json');
    const abilityScores2024 = readYearFile('2024', '5e-SRD-Ability-Scores.json');
    const equipmentCategories2014 = readYearFile('2014', '5e-SRD-Equipment-Categories.json');
    const equipmentCategories2024 = readYearFile('2024', '5e-SRD-Equipment-Categories.json');
    const proficiencies2014 = readYearFile('2014', '5e-SRD-Proficiencies.json');
    const proficiencies2024 = readYearFile('2024', '5e-SRD-Proficiencies.json');
    const magicItems2014 = readYearFile('2014', '5e-SRD-Magic-Items.json');
    rules2014.forEach((record) => {
        const lookupId = getReferenceLookupId(ctx, record);
        if (!lookupId) {
            return;
        }
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'lookups',
            leftId: lookupId,
            relationshipRole: 'contains',
            value: record.subsections,
        });
    });
    const linkAbilitySkills = (sourceCode, records) => {
        records.forEach((record) => {
            const lookupId = getReferenceLookupId(ctx, record);
            if (!lookupId) {
                return;
            }
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'lookups',
                leftId: lookupId,
                relationshipRole: 'governs',
                value: record.skills,
            });
        });
    };
    linkAbilitySkills('2014', abilityScores2014);
    linkAbilitySkills('2024', abilityScores2024);
    const linkCategoryItems = (sourceCode, records) => {
        records.forEach((record) => {
            const lookupId = getReferenceLookupId(ctx, record);
            if (!lookupId) {
                return;
            }
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'lookups',
                leftId: lookupId,
                relationshipRole: 'contains',
                value: record.equipment,
            });
        });
    };
    linkCategoryItems('2014', equipmentCategories2014);
    linkCategoryItems('2024', equipmentCategories2024);
    const linkProficiencyOwners = (sourceCode, records) => {
        records.forEach((record) => {
            var _a, _b, _c;
            const lookupId = getReferenceLookupId(ctx, record);
            if (!lookupId) {
                return;
            }
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'lookups',
                leftId: lookupId,
                relationshipRole: 'references',
                value: record.reference ? [record.reference] : [],
            });
            addLinksFromValue(ctx, {
                sourceCode,
                leftTable: 'lookups',
                leftId: lookupId,
                relationshipRole: 'granted-by',
                value: [
                    ...((_a = record.classes) !== null && _a !== void 0 ? _a : []),
                    ...((_b = record.races) !== null && _b !== void 0 ? _b : []),
                    ...((_c = record.backgrounds) !== null && _c !== void 0 ? _c : []),
                ],
            });
        });
    };
    linkProficiencyOwners('2014', proficiencies2014);
    linkProficiencyOwners('2024', proficiencies2024);
    magicItems2014.forEach((record) => {
        var _a;
        const itemEntry = ctx.resolveUrl(record.url);
        if (!itemEntry || itemEntry.table !== 'items') {
            return;
        }
        addLinksFromValue(ctx, {
            sourceCode: '2014',
            leftTable: 'items',
            leftId: itemEntry.id,
            relationshipRole: 'variant',
            value: (_a = record.variants) !== null && _a !== void 0 ? _a : [],
        });
    });
}
function seedNormalizedDatabase(db) {
    const ctx = new SeedContext();
    seedSources(ctx);
    seedManualLookups(ctx);
    const { classProgression, subclassProgression } = seedLookupRows(ctx);
    seedEntities(ctx, classProgression, subclassProgression);
    seedFeatures(ctx);
    seedSpells(ctx);
    seedItems(ctx);
    seedActors(ctx);
    seedRuleLinks(ctx);
    insertRows(db, 'sources', SOURCE_COLUMNS, ctx.sourceRows);
    insertRows(db, 'lookups', LOOKUP_COLUMNS, ctx.lookupRows);
    insertRows(db, 'entities', ENTITY_COLUMNS, ctx.entityRows);
    insertRows(db, 'features', FEATURE_COLUMNS, ctx.featureRows);
    insertRows(db, 'spells', SPELL_COLUMNS, ctx.spellRows);
    insertRows(db, 'items', ITEM_COLUMNS, ctx.itemRows);
    insertRows(db, 'actors', ACTOR_COLUMNS, ctx.actorRows);
    insertRows(db, 'links', LINK_COLUMNS, ctx.linkRows);
    console.log(`Seeded normalized database: ` +
        `${ctx.sourceRows.length} sources, ` +
        `${ctx.lookupRows.length} lookups, ` +
        `${ctx.entityRows.length} entities, ` +
        `${ctx.featureRows.length} features, ` +
        `${ctx.spellRows.length} spells, ` +
        `${ctx.itemRows.length} items, ` +
        `${ctx.actorRows.length} actors, ` +
        `${ctx.linkRows.length} links.`);
}
