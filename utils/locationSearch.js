import { Op } from 'sequelize';

/**
 * US state / city helpers for profile browse search.
 * Searching "California" or "Florida" matches state field + known cities in that state.
 */

const CALIFORNIA_CITIES = [
  'Los Angeles',
  'San Diego',
  'San Jose',
  'San Francisco',
  'Sacramento',
  'Fresno',
  'Oakland',
  'Long Beach',
  'Anaheim',
  'Santa Ana',
  'Riverside',
  'Bakersfield',
];

const FLORIDA_CITIES = [
  'Miami',
  'Orlando',
  'Tampa',
  'Jacksonville',
  'Fort Lauderdale',
  'St. Petersburg',
  'Hialeah',
  'Tallahassee',
  'Cape Coral',
  'Gainesville',
  'Hollywood',
  'Palm Bay',
];

const US_STATE_SEARCH = [
  {
    state: 'California',
    cities: CALIFORNIA_CITIES,
    aliases: ['california', 'calif', 'ca'],
  },
  {
    state: 'Florida',
    cities: FLORIDA_CITIES,
    aliases: ['florida', 'fl'],
  },
];

export function normalizeLocationTerm(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/'/g, "''")
    .toLowerCase();
}

function stripTrailingCountry(normalized) {
  return normalized.replace(/,?\s*(usa|u\.s\.a\.|united states)\s*$/i, '').trim();
}

function matchesStateAlias(normalized, aliases) {
  const term = stripTrailingCountry(normalized);
  if (!term) return false;
  return aliases.some((alias) => {
    if (alias.length <= 2) return term === alias;
    return term === alias || term.includes(alias);
  });
}

/**
 * @param {string} term raw search text
 * @returns {{ state: string, cities: string[] } | null}
 */
export function resolveUsStateLocationSearch(term) {
  const normalized = normalizeLocationTerm(term);
  if (!normalized) return null;
  for (const entry of US_STATE_SEARCH) {
    if (matchesStateAlias(normalized, entry.aliases)) {
      return { state: entry.state, cities: entry.cities };
    }
  }
  return null;
}

function citySql() {
  return `regexp_replace(lower(coalesce("location"->>'city', '')), '\\s+', ' ', 'g')`;
}

function countrySql() {
  return `regexp_replace(lower(coalesce("location"->>'country', '')), '\\s+', ' ', 'g')`;
}

function stateSql() {
  return `regexp_replace(lower(coalesce("location"->>'state', '')), '\\s+', ' ', 'g')`;
}

/**
 * Build Sequelize OR conditions for a single location search term.
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} term
 * @returns {object[]} conditions to spread into Op.and
 */
export function buildLocationSearchConditions(sequelize, term) {
  const normalized = normalizeLocationTerm(term);
  if (!normalized) return [];

  const orLiterals = [
    sequelize.literal(`${citySql()} LIKE '%${normalized}%'`),
    sequelize.literal(`${countrySql()} LIKE '%${normalized}%'`),
    sequelize.literal(`${stateSql()} LIKE '%${normalized}%'`),
  ];

  const stateMatch = resolveUsStateLocationSearch(term);
  if (stateMatch) {
    const stateNorm = normalizeLocationTerm(stateMatch.state);
    orLiterals.push(sequelize.literal(`${stateSql()} LIKE '%${stateNorm}%'`));
    for (const cityName of stateMatch.cities) {
      const cityNorm = normalizeLocationTerm(cityName);
      orLiterals.push(sequelize.literal(`${citySql()} LIKE '%${cityNorm}%'`));
    }
  }

  return [{ [Op.or]: orLiterals }];
}

/**
 * City + country from "City, Country" input — use state expansion when city is a US state name.
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} city
 * @param {string} country
 * @returns {object[]} conditions to spread into Op.and
 */
export function buildCityCountrySearchConditions(sequelize, city, country) {
  const stateFromCity = resolveUsStateLocationSearch(city);
  const countryNorm = normalizeLocationTerm(country);
  const isUsCountry =
    !countryNorm ||
    countryNorm === 'usa' ||
    countryNorm.includes('united states') ||
    countryNorm === 'u.s.a.' ||
    countryNorm === 'u.s.a';

  if (stateFromCity && isUsCountry) {
    return buildLocationSearchConditions(sequelize, stateFromCity.state);
  }

  const conditions = [];
  const normalizedCity = normalizeLocationTerm(city);
  if (normalizedCity) {
    conditions.push(
      sequelize.literal(`${citySql()} LIKE '%${normalizedCity}%'`)
    );
  }
  const normalizedCountry = normalizeLocationTerm(country);
  if (normalizedCountry) {
    conditions.push(
      sequelize.literal(`${countrySql()} LIKE '%${normalizedCountry}%'`)
    );
  }
  return conditions;
}
