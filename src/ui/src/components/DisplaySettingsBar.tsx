import type { DisplaySettings } from "../../../types/review.ts";

/** Compact toolbar of the diff display controls (source D). */
export function DisplaySettingsBar({
  settings,
  update,
}: {
  settings: DisplaySettings;
  update: (patch: Partial<DisplaySettings>) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs"
      style={{ borderColor: "var(--rb-border)", background: "var(--rb-panel)" }}
    >
      <Segmented
        label="Layout"
        value={settings.layout}
        options={[
          ["unified", "Unified"],
          ["split", "Split"],
        ]}
        onChange={(v) => update({ layout: v })}
      />
      <Segmented
        label="Granularity"
        value={settings.granularity}
        options={[
          ["line", "Line"],
          ["word", "Word"],
        ]}
        onChange={(v) => update({ granularity: v })}
      />
      <Segmented
        label="Indicator"
        value={settings.changeIndicator}
        options={[
          ["classic", "Classic"],
          ["bars", "Bars"],
          ["none", "None"],
        ]}
        onChange={(v) => update({ changeIndicator: v })}
      />
      <Segmented
        label="Theme"
        value={settings.theme}
        options={[
          ["auto", "Auto"],
          ["light", "Light"],
          ["dark", "Dark"],
        ]}
        onChange={(v) => update({ theme: v })}
      />
      <Toggle label="Wrap" checked={settings.wrap} onChange={(v) => update({ wrap: v })} />
      <Toggle
        label="Line numbers"
        checked={settings.lineNumbers}
        onChange={(v) => update({ lineNumbers: v })}
      />
      <Toggle
        label="Backgrounds"
        checked={settings.backgrounds}
        onChange={(v) => update({ backgrounds: v })}
      />
    </div>
  );
}

function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: [V, string][];
  onChange: (v: V) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span style={{ color: "var(--rb-muted)" }}>{label}</span>
      <span className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: "var(--rb-border)" }}>
        {options.map(([val, text]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className="px-2 py-1 transition"
            style={{
              background: value === val ? "var(--rb-accent)" : "transparent",
              color: value === val ? "#fff" : "var(--rb-fg)",
            }}
          >
            {text}
          </button>
        ))}
      </span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--rb-accent)]"
      />
      <span style={{ color: "var(--rb-muted)" }}>{label}</span>
    </label>
  );
}
