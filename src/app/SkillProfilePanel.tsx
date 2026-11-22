import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, localizedName } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import type { SkillLevel, SkillProfile } from '../domain/skills.ts';
import { copySkillProfile, presetSkills, skillLevel, skillProfileName } from '../domain/skills.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import type { WorkerResponse } from '../fitting/worker-protocol.ts';
import type { createFittingWorker } from '../fitting/worker-client.ts';

export function SkillProfilePanel({ worker, profiles, profile, onSelect, onSave }: {
  worker?: ReturnType<typeof createFittingWorker>;
  profiles: SkillProfile[];
  profile: SkillProfile;
  onSelect: (id: string) => void;
  onSave: (profile: SkillProfile) => Promise<void>;
}) {
  const { m, locale, text } = useLocale();
  const [editing, setEditing] = useState<SkillProfile>();
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<CatalogType[]>([]);
  const [error, setError] = useState<Text>('');
  const editingId = editing?.id;

  useEffect(() => {
    if (!worker || !editingId) return;
    let current = true;
    worker.request({ kind: 'search', query, offset: 0, limit: 30, categoryIds: [16] }).then(value => {
      if (current) setSkills(value.results);
    }).catch(reason => { if (current) setError(errorText(reason)); });
    return () => { current = false; };
  }, [worker, query, editingId]);

  async function startEdit() {
    try {
      if (profile.source === 'custom') {
        setEditing(structuredClone(profile));
        return;
      }
      const ids: number[] = [];
      let offset: number | null = 0;
      while (worker && profile.source === 'all-v' && offset !== null) {
        const page: Extract<WorkerResponse, { kind: 'search' }> = await worker.request({ kind: 'search', query: '', offset, limit: 100, categoryIds: [16], includeUnpublished: true });
        ids.push(...page.results.map(entry => entry.typeId));
        offset = page.nextOffset;
      }
      setEditing(copySkillProfile(profile, m.profileCopyName(skillProfileName(profile, m)), ids));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return <div className="profiles">
    <label className="field">{m.skillProfile}
      <select value={profile.id} onChange={event => onSelect(event.target.value)}>
        {[...Object.values(presetSkills), ...profiles].map(entry => <option key={entry.id} value={entry.id}>{skillProfileName(entry, m)}</option>)}
      </select>
    </label>
    <button type="button" className="subtle" onClick={() => void startEdit()}>{profile.source === 'custom' ? m.editProfile : m.copyProfile}</button>
    {error && <p role="alert">{text(error)}</p>}
    {editing && <div className="profile-edit">
      <h3>{m.editSkills}</h3>
      <label className="field">{m.profileName}
        <input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
      </label>
      <label className="field">{m.searchSkills}
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="skill-list">
        {skills.map(skill => <label key={skill.typeId}>
          {localizedName(locale, skill.names) ?? `#${skill.typeId}`}<select value={skillLevel(editing, skill.typeId)}
            onChange={event => setEditing({ ...editing, levels: { ...editing.levels, [skill.typeId]: Number(event.target.value) as SkillLevel } })}>
            {[0, 1, 2, 3, 4, 5].map(level => <option key={level}>{level}</option>)}
          </select>
        </label>)}
      </div>
      <div className="actions">
        <button className="primary" disabled={!editing.name.trim()} onClick={() => {
          onSave({ ...editing, name: editing.name.trim() }).then(() => setEditing(undefined)).catch(reason => setError(errorText(reason)));
        }}>{m.saveProfile}</button>
        <button onClick={() => setEditing(undefined)}>{m.cancel}</button>
      </div>
    </div>}
  </div>;
}
