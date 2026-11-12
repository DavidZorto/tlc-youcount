const L = require("./_lib");

async function allPages(app, path) {
  const data = [],
    included = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const join = path.includes("?") ? "&" : "?",
      page = await L.pcAppFetch(
        app,
        `${path}${join}per_page=100&offset=${offset}`,
      );
    data.push(...(page.data || []));
    included.push(...(page.included || []));
    if ((page.data || []).length < 100) break;
  }
  return { data, included };
}
const normaliseName = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`\-–—]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const includedMap = (included, type) =>
  new Map(
    included
      .filter((item) => String(item.type).toLowerCase() === type.toLowerCase())
      .map((item) => [String(item.id), item]),
  );
const related = (person, key, map) =>
  (person.relationships?.[key]?.data || [])
    .map((item) => map.get(String(item.id)))
    .filter(Boolean);
function cachedPerson(person, included, fieldDefinitions) {
  const attributes = person.attributes || {},
    emailMap = includedMap(included, "Email"),
    phoneMap = includedMap(included, "PhoneNumber"),
    addressMap = includedMap(included, "Address"),
    fieldMap = includedMap(included, "FieldDatum"),
    householdMap = includedMap(included, "Household"),
    peopleMap = includedMap(included, "Person"),
    emails = related(person, "emails", emailMap)
      .map((item) => item.attributes?.address || "")
      .filter(Boolean),
    phones = related(person, "phone_numbers", phoneMap)
      .map(
        (item) =>
          item.attributes?.e164 ||
          item.attributes?.international ||
          item.attributes?.number ||
          "",
      )
      .filter(Boolean),
    addresses = related(person, "addresses", addressMap),
    primaryAddress = addresses.find((item) => item.attributes?.primary) || addresses[0],
    address = primaryAddress?.attributes || {},
    fields = related(person, "field_data", fieldMap).map((item) => ({
      name: String(
        fieldDefinitions.get(
          String(item.relationships?.field_definition?.data?.id || ""),
        ) || "",
      ).toLowerCase(),
      value: item.attributes?.value ?? item.attributes?.display_value ?? "",
    })),
    households = related(person, "households", householdMap),
    householdPeople = households
      .flatMap((household) =>
        (household.relationships?.people?.data || [])
          .map((item) => peopleMap.get(String(item.id)))
          .filter(Boolean),
      )
      .filter((item) => String(item.id) !== String(person.id))
      .map((item) => ({
        name:
          item.attributes?.name ||
          `${item.attributes?.first_name || ""} ${item.attributes?.last_name || ""}`.trim(),
        birthdate: item.attributes?.birthdate || "",
      })),
    tokens = [
      attributes.first_name,
      attributes.given_name,
      attributes.nickname,
      attributes.last_name,
      attributes.name,
    ]
      .flatMap((value) => normaliseName(value).split(" "))
      .filter(Boolean),
    // Store privacy-preserving hashes of name fragments so familiar names and
    // shortened names can build a candidate set without exposing cached names.
    // Contact evidence and OTP remain the actual identity checks.
    nameFragments = [
      ...new Set(
        tokens.flatMap((token) => {
          if (token.length < 3) return [token];
          const fragments = [];
          for (let start = 0; start <= token.length - 3; start += 1)
            for (let end = start + 3; end <= token.length; end += 1)
              fragments.push(token.slice(start, end));
          return fragments;
        }),
      ),
    ],
    profile = {
      id: String(person.id),
      attributes,
      emails,
      phones,
      address,
      fields,
      householdName: String(households[0]?.attributes?.name || ""),
      householdPeople,
    };
  return {
    id: String(person.id),
    nameHashes: nameFragments.map((token) => L.hash(`pc-name:${token}`)),
    payload: L.encrypt(profile),
    updatedAt: attributes.updated_at || null,
  };
}
async function syncPeople(db) {
  const definitionRows = await db.query(
      `SELECT id,tab_name,name FROM pc_custom_fields`,
    ),
    fieldDefinitions = new Map(
      definitionRows.map((item) => [
        String(item.id),
        `${item.tab_name || ""} ${item.name || ""}`.trim(),
      ]),
    ),
    runId = L.token(),
    startedAt = new Date();
  // Nightly runs fetch only people changed since the previous run. A full run,
  // which also marks people removed from Planning Center as inactive, happens
  // weekly, when the cache key changes, or when no earlier run is recorded.
  const state = Object.fromEntries(
      (
        await db.query(
          `SELECT name,value FROM pc_sync_state WHERE name IN ('people_cache_ready','people_full_sync_at','people_sync_since')`,
        )
      ).map((row) => [row.name, row.value]),
    ),
    lastFull = Date.parse(state.people_full_sync_at || ""),
    since = Date.parse(state.people_sync_since || ""),
    full =
      state.people_cache_ready !== L.hash("pc-cache-key-v1") ||
      !(lastFull > startedAt - 7 * 24 * 60 * 60 * 1000) ||
      !since,
    // One hour of overlap covers clock skew and edits made during the last run.
    filter = full
      ? ""
      : `&where[updated_at][gte]=${encodeURIComponent(new Date(since - 60 * 60 * 1000).toISOString())}`;
  let offset = 0,
    count = 0;
  for (; offset < 100000; offset += 100) {
    const page = await L.pcFetch(
        `/people?include=addresses,emails,phone_numbers,field_data,households.people&per_page=100&offset=${offset}${filter}`,
      ),
      people = page.data || [],
      rows = people.map((person) =>
        cachedPerson(person, page.included || [], fieldDefinitions),
      );
    if (rows.length) {
      const values = [],
        placeholders = rows.map((row, index) => {
          const base = index * 7;
          values.push(
            row.id,
            row.nameHashes,
            row.payload,
            row.updatedAt,
            runId,
            L.hash("pc-cache-key-v1"),
            true,
          );
          return `($${base + 1},$${base + 2}::text[],$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`;
        });
      await db.query(
        `INSERT INTO pc_people_cache(planning_center_id,name_hashes,profile_payload,source_updated_at,sync_run_id,key_fingerprint,active)
         VALUES ${placeholders.join(",")}
         ON CONFLICT(planning_center_id) DO UPDATE SET
           name_hashes=excluded.name_hashes,profile_payload=excluded.profile_payload,
           source_updated_at=excluded.source_updated_at,sync_run_id=excluded.sync_run_id,
           key_fingerprint=excluded.key_fingerprint,
           active=true,synced_at=now()`,
        values,
      );
    }
    count += people.length;
    if (people.length < 100) break;
  }
  if (full && count)
    await db.query(
      `UPDATE pc_people_cache SET active=false,synced_at=now() WHERE sync_run_id<>$1`,
      [runId],
    );
  await db.query(
    `INSERT INTO pc_sync_state(name,value,updated_at)
     VALUES('people_cache_ready',$1,now()),('people_sync_since',$2,now())
     ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()`,
    [L.hash("pc-cache-key-v1"), startedAt.toISOString()],
  );
  if (full && count)
    await db.query(
      `INSERT INTO pc_sync_state(name,value,updated_at) VALUES('people_full_sync_at',$1,now())
       ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()`,
      [startedAt.toISOString()],
    );
  return { people: count, peopleSync: full ? "full" : "changed_only" };
}
async function syncMemberships(db) {
  const runId = L.token(),
    knownGroupRows = await db.query("SELECT id FROM pc_groups"),
    knownGroups = new Set(knownGroupRows.map((row) => String(row.id)));
  let count = 0,
    ignored = 0;
  for (let offset = 0; offset < 100000; offset += 100) {
    const page = await L.pcAppFetch(
        "groups",
        `/memberships?per_page=100&offset=${offset}`,
      ),
      memberships = (page.data || [])
        .map((membership) => ({
          personId: String(membership.relationships?.person?.data?.id || ""),
          groupId: String(membership.relationships?.group?.data?.id || ""),
        }))
        .filter((item) => item.personId && item.groupId),
      rows = memberships.filter((item) => knownGroups.has(item.groupId));
    ignored += memberships.length - rows.length;
    if (rows.length) {
      const values = [],
        placeholders = rows.map((row, index) => {
          const base = index * 3;
          values.push(
            L.hash(`pc-person:${row.personId}`),
            row.groupId,
            runId,
          );
          return `($${base + 1},$${base + 2},$${base + 3})`;
        });
      await db.query(
        `INSERT INTO pc_person_group_cache(person_hash,group_id,sync_run_id)
         VALUES ${placeholders.join(",")}
         ON CONFLICT(person_hash,group_id) DO UPDATE SET
           sync_run_id=excluded.sync_run_id,synced_at=now()`,
        values,
      );
    }
    count += rows.length;
    if ((page.data || []).length < 100) break;
  }
  if (count)
    await db.query(`DELETE FROM pc_person_group_cache WHERE sync_run_id<>$1`, [runId]);
  return { memberships: count, ignoredMemberships: ignored };
}
async function syncGroups(db) {
  const typesDoc = await allPages("groups", "/group_types?order=position");
  const typeMap = new Map(
    typesDoc.data.map((type) => [String(type.id), type.attributes || {}]),
  );
  for (const type of typesDoc.data) {
    const a = type.attributes || {};
    await db.query(
      `INSERT INTO pc_group_types(id,name,position,church_center_visible,synced_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,church_center_visible=excluded.church_center_visible,synced_at=now()`,
      [
        String(type.id),
        a.name || "Other group",
        a.position || null,
        Boolean(a.church_center_visible),
      ],
    );
  }
  const groupsDoc = await allPages(
    "groups",
    "/groups?include=group_type,location&order=name",
  );
  const locations = new Map(
    groupsDoc.included
      .filter((item) => item.type === "Location")
      .map((item) => [String(item.id), item.attributes || {}]),
  );
  const seen = [];
  for (const group of groupsDoc.data) {
    const a = group.attributes || {},
      typeId = String(group.relationships?.group_type?.data?.id || ""),
      type = typeMap.get(typeId) || {},
      locationId = String(group.relationships?.location?.data?.id || ""),
      location = locations.get(locationId) || {},
      visible = location.display_preference !== "hidden",
      locationLabel = visible
        ? location.name ||
          location.full_formatted_address ||
          "Location not provided"
        : "Location not displayed",
      name = a.name || "Unnamed group",
      typeName = type.name || "Other group",
      schedule = a.schedule || "",
      active = !a.archived_at;
    seen.push(String(group.id));
    await db.query(
      `INSERT INTO pc_groups(id,name,group_type_id,group_type_name,location_label,schedule,active,search_text,synced_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_type_id=excluded.group_type_id,group_type_name=excluded.group_type_name,location_label=excluded.location_label,schedule=excluded.schedule,active=excluded.active,search_text=excluded.search_text,synced_at=now()`,
      [
        String(group.id),
        name,
        typeId || null,
        typeName,
        locationLabel,
        schedule,
        active,
        `${name} ${typeName} ${locationLabel} ${schedule}`,
      ],
    );
  }
  if (seen.length)
    await db.query(
      "UPDATE pc_groups SET active=false,synced_at=now() WHERE NOT(id=ANY($1::text[]))",
      [seen],
    );
  return { groupTypes: typesDoc.data.length, groups: groupsDoc.data.length };
}
async function syncCustomFields(db) {
  const tabsDoc = await allPages(
    "people",
    "/tabs?include=field_definitions,field_options&order=sequence",
  );
  const tabs = new Map(
    tabsDoc.data.map((tab) => [String(tab.id), tab.attributes || {}]),
  );
  const optionMap = new Map();
  for (const item of tabsDoc.included.filter(
    (item) => item.type === "FieldOption",
  )) {
    const definitionId = String(
      item.relationships?.field_definition?.data?.id || "",
    );
    if (!optionMap.has(definitionId)) optionMap.set(definitionId, []);
    optionMap
      .get(definitionId)
      .push({
        id: String(item.id),
        value: item.attributes?.value || item.attributes?.name || "",
      });
  }
  const definitions = tabsDoc.included.filter(
    (item) => item.type === "FieldDefinition",
  );
  for (const field of definitions) {
    const a = field.attributes || {},
      tabId = String(field.relationships?.tab?.data?.id || a.tab_id || ""),
      tab = tabs.get(tabId) || {};
    await db.query(
      `INSERT INTO pc_custom_fields(id,tab_id,tab_name,name,slug,data_type,options,sequence,synced_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now()) ON CONFLICT(id) DO UPDATE SET tab_id=excluded.tab_id,tab_name=excluded.tab_name,name=excluded.name,slug=excluded.slug,data_type=excluded.data_type,options=excluded.options,sequence=excluded.sequence,synced_at=now()`,
      [
        String(field.id),
        tabId,
        tab.name || "Custom",
        a.name || "Custom field",
        a.slug || null,
        a.data_type || "string",
        JSON.stringify(optionMap.get(String(field.id)) || []),
        a.sequence || null,
      ],
    );
  }
  return { tabs: tabsDoc.data.length, customFields: definitions.length };
}
async function syncCatalogues(db) {
  // Each part runs even if an earlier one fails, so a Planning Center hiccup in
  // groups does not leave member search on yesterday's people. Failures are
  // reported together afterwards so the job still shows as failed.
  const result = {},
    failures = [];
  for (const [name, run] of [
    ["custom_fields", syncCustomFields],
    ["groups", syncGroups],
    ["memberships", syncMemberships],
    ["people", syncPeople],
  ]) {
    try {
      Object.assign(result, await run(db));
    } catch (error) {
      failures.push(`${name}_sync_failed:${error.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join(";"));
  return result;
}
module.exports = { syncCatalogues, syncGroups, syncPeople, syncMemberships };
