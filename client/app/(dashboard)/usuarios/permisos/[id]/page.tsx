'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getUserPermisos,
  putUserPermisos,
  SECTION_CATALOG,
  type EffectiveGrid,
  type SectionAccessLevel,
  type UserOverrideEntryPayload,
} from '../../../../lib/permisos';
import { getUser, type UserListItem } from '../../../../lib/users';
import { showError, showSuccess } from '../../../../lib/alerts';

const LEVEL_LABELS: Record<SectionAccessLevel, string> = {
  total: 'Acceso total',
  lectura: 'Solo lectura',
  sin_acceso: 'Sin acceso',
};

const LEVEL_BADGE_CLASSES: Record<SectionAccessLevel, string> = {
  total: 'bg-green-100 text-green-700',
  lectura: 'bg-amber-100 text-amber-700',
  sin_acceso: 'bg-stone-100 text-stone-600',
};

// Sentinel used only by the <select> control below — never sent to the API.
// The API's "clear the override" wire value is `null` (see putUserPermisos).
const HEREDAR_VALUE = 'heredar';
type ControlValue = SectionAccessLevel | typeof HEREDAR_VALUE;

function levelBadge(level: SectionAccessLevel) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_BADGE_CLASSES[level]}`}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

export default function PermisosUsuarioPage({ params }: { params: { id: string } }) {
  const userId = Number(params.id);

  const [user, setUser] = useState<UserListItem | null>(null);
  const [grid, setGrid] = useState<EffectiveGrid | null>(null);
  const [overrides, setOverrides] = useState<Record<string, SectionAccessLevel | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [userData, gridData] = await Promise.all([
          getUser(userId),
          getUserPermisos(userId),
        ]);
        if (cancelled) return;
        setUser(userData);
        setGrid(gridData);
        const initialOverrides: Record<string, SectionAccessLevel | null> = {};
        gridData.sections.forEach((row) => {
          initialOverrides[row.sectionId] = row.overrideLevel;
        });
        setOverrides(initialOverrides);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleControlChange = (sectionId: string, value: ControlValue) => {
    setOverrides((prev) => ({
      ...prev,
      [sectionId]: value === HEREDAR_VALUE ? null : value,
    }));
  };

  const roleLevelFor = (sectionId: string): SectionAccessLevel =>
    grid?.sections.find((row) => row.sectionId === sectionId)?.roleLevel ?? 'sin_acceso';

  const effectiveLevelFor = (sectionId: string): SectionAccessLevel => {
    const override = overrides[sectionId];
    return override ?? roleLevelFor(sectionId);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const sections: UserOverrideEntryPayload[] = SECTION_CATALOG.map((section) => ({
        sectionId: section.id,
        level: overrides[section.id] ?? null,
      }));
      const fresh = await putUserPermisos(userId, sections);
      setGrid(fresh);
      const freshOverrides: Record<string, SectionAccessLevel | null> = {};
      fresh.sections.forEach((row) => {
        freshOverrides[row.sectionId] = row.overrideLevel;
      });
      setOverrides(freshOverrides);
      showSuccess('Permisos guardados', 'Los cambios se guardaron correctamente.');
    } catch (err) {
      showError(
        'No se pudieron guardar los permisos',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSaving(false);
    }
  };

  const displayName = user
    ? `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.username
    : '';

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Permisos de usuario
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos del usuario...' : `Permisos de ${displayName}`}
        </p>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Configurá el acceso por sección para este usuario. Todavía no se aplica el bloqueo — la
          restricción llega en una etapa futura.
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando permisos...
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
          </div>
          <Link
            href="/usuarios"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Sección
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Valor del rol
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acceso del usuario
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Efectivo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {SECTION_CATALOG.map((section) => {
                const roleLevel = roleLevelFor(section.id);
                const overrideLevel = overrides[section.id] ?? null;
                const effectiveLevel = effectiveLevelFor(section.id);
                const controlValue: ControlValue = overrideLevel ?? HEREDAR_VALUE;

                return (
                  <tr key={section.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 text-sm font-medium text-stone-800">
                      {section.label}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">{levelBadge(roleLevel)}</td>
                    <td className="px-4 py-3 text-center text-sm">
                      <select
                        value={controlValue}
                        onChange={(e) =>
                          handleControlChange(section.id, e.target.value as ControlValue)
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      >
                        <option value={HEREDAR_VALUE}>Usar valor del rol (heredar)</option>
                        <option value="total">Acceso total</option>
                        <option value="lectura">Solo lectura</option>
                        <option value="sin_acceso">Sin acceso</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">{levelBadge(effectiveLevel)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex gap-3 border-t border-stone-200 px-4 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <Link
              href="/usuarios"
              className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
            >
              Volver
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
