// Build-time trusted catalog import. Run in Docker before publishing this migration.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const input = fs.readFileSync('prisma/data/2504009.geojson', 'utf8');
const features = JSON.parse(input).features;
const hash = createHash('sha256').update(input).digest('hex');
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
const lines = [];
for (const feature of features) {
 const p = feature.properties;
 const name = p.NM_BAIRRO ?? p.nm_bairro ?? p.name;
 const code = String(p.CD_BAIRRO ?? p.cd_bairro ?? createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex'));
 if (!name || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw Error('Unsupported source feature');
 const h = createHash('sha256').update(`PB:2504009:${code}`).digest('hex');
 const id = `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
 lines.push(`INSERT INTO neighborhood_references (id,state,city_code,city,source_code,name,geometry,source_hash) VALUES (${sql(id)},'PB','2504009','Campina Grande',${sql(code)},${sql(name)},${sql(JSON.stringify(feature.geometry))}::jsonb,${sql(hash)});`);
}
const path = 'prisma/migrations/20261010010000_delivery_areas/migration.sql';
const base = fs.readFileSync(path, 'utf8').split('-- TRUSTED CATALOG')[0];
fs.writeFileSync(path, base + '-- TRUSTED CATALOG\n' + lines.join('\n') + '\n');
console.log(`Catalog: ${lines.length} neighborhoods; source SHA256 ${hash}`);
