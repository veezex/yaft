"""Translate an imported CCP HTTP SDE into a disposable Pyfa source checkout."""
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
pyfa = Path(sys.argv[2])
staticdata = pyfa / 'staticdata'
build = json.loads((source / 'manifest.json').read_text())['buildNumber']

def rows(table):
    return (json.loads(line) for line in (source / f'{table}.jsonl').read_text().splitlines() if line)

def save(folder, table, data):
    for previous in folder.glob(f'{table}.*.json'):
        previous.unlink()
    (folder / f'{table}.0.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

def translation(value):
    return {('en-us' if key == 'en' else key): text for key, text in value.items()}

def transform(row, renames):
    for old, new in renames.items():
        if old in row:
            row[new] = row.pop(old)
    for key in ['typeName', 'groupName', 'categoryName', 'displayName', 'description']:
        if isinstance(row.get(key), dict):
            row[key] = translation(row[key])
    return row

tables = {
    'types': ('typeID', {'name': 'typeName'}),
    'groups': ('groupID', {'name': 'groupName'}),
    'categories': ('categoryID', {'name': 'categoryName'}),
    'typeDogma': ('typeID', {}),
    'dogmaAttributes': ('attributeID', {'attributeCategoryID': 'categoryID'}),
    'dogmaEffects': ('effectID', {'effectCategoryID': 'effectCategory', 'name': 'effectName'}),
    'dogmaUnits': ('unitID', {}),
    'marketGroups': ('marketGroupID', {}),
    'metaGroups': ('metaGroupID', {}),
}
for table, (key, renames) in tables.items():
    data = {}
    for row in rows(table):
        if table == 'types':
            for field in ('published', 'mass', 'volume', 'capacity', 'radius', 'basePrice', 'portionSize'):
                row.setdefault(field, 0)
        data[row[key]] = transform(row, renames)
    save(staticdata / 'fsd_built', table.lower(), data)

dynamic = {}
for row in rows('dynamicItemAttributes'):
    dynamic[row['typeID']] = {
        **row,
        'attributeIDs': {attribute['attributeID']: {'min': attribute['min'], 'max': attribute['max']}
                         for attribute in row['attributeIDs']},
    }
save(staticdata / 'fsd_built', 'dynamicitemattributes', dynamic)

skill_slots = [(182, 277), (183, 278), (184, 279), (1285, 1286), (1289, 1287), (1290, 1288)]
requirements = {}
for row in rows('typeDogma'):
    attrs = {attribute['attributeID']: attribute['value'] for attribute in row['dogmaAttributes']}
    skills = {int(attrs[skill]): int(attrs[level]) for skill, level in skill_slots
              if attrs.get(skill, 0) > 0 and attrs.get(level, 0) > 0}
    if skills:
        requirements[row['typeID']] = skills
save(staticdata / 'fsd_built', 'requiredskillsfortypes', requirements)
save(staticdata / 'fsd_lite', 'clonegrades', {row['cloneGradeID']: row for row in rows('cloneGrades')})
metadata = staticdata / 'phobos' / 'metadata.0.json'
data = json.loads(metadata.read_text())
for row in data:
    if row['field_name'] == 'client_build':
        row['field_value'] = str(build)
metadata.write_text(json.dumps(data), encoding='utf-8')
