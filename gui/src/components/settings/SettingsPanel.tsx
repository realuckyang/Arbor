import { useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../../api";
import { api } from "../../api";
import { Check } from "lucide-react";

const emptySettings: Settings = {
  apiUrl: "",
  apiKey: "",
  model: "",
  showActivityBar: false,
  system: "",
};

const inputClass =
  "w-full border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none transition-colors focus:border-accent";

type SettingsTab = "model" | "interface";

export function SettingsPanel({ onSaved }: { onSaved?: (settings: Settings) => void }) {
  const [form, setForm] = useState<Settings>(emptySettings);
  const [persisted, setPersisted] = useState<Settings>(emptySettings);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("model");

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then((r) => {
      if (cancelled) return;
      const settings = { ...emptySettings, ...r.settings };
      setForm(settings);
      setPersisted(settings);
    });
    return () => { cancelled = true; };
  }, []);

  const saveModel = async () => {
    const result = await api.saveSettings(form);
    const settings = { ...emptySettings, ...result.settings };
    setForm(settings);
    setPersisted(settings);
    onSaved?.(result.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setAndSave = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...persisted, [key]: value };
    setForm((current) => ({ ...current, [key]: value }));
    const result = await api.saveSettings(next);
    const settings = { ...emptySettings, ...result.settings };
    setPersisted(settings);
    setForm((current) => ({ ...current, [key]: settings[key] }));
    onSaved?.(settings);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-4xl px-5 py-6 md:px-8">
        <div className="mb-5 min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-text">设置</h1>
          <div className="mt-1 text-[13px] text-text-faint">模型与界面</div>
        </div>

        <div className="mb-6 flex h-9 items-end gap-5 border-b border-border" role="tablist" aria-label="设置分类">
          <SettingsTabButton id="model" active={activeTab === "model"} onClick={setActiveTab}>
            模型
          </SettingsTabButton>
          <SettingsTabButton id="interface" active={activeTab === "interface"} onClick={setActiveTab}>
            界面
          </SettingsTabButton>
        </div>

        {activeTab === "model" ? (
          <div className="divide-y divide-border">
            <Field label="API URL">
              <input
                className={inputClass}
                value={form.apiUrl}
                onChange={(e) => set("apiUrl", e.target.value)}
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </Field>

            <Field label="API Key">
              <input
                className={inputClass}
                type="password"
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
              />
            </Field>

            <Field label="Model">
              <input
                className={inputClass}
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="gpt-4o / deepseek-chat / ..."
              />
            </Field>

            <Field label="Default System Prompt" alignTop>
              <textarea
                className={`${inputClass} min-h-40 resize-y leading-relaxed`}
                rows={8}
                value={form.system}
                onChange={(e) => set("system", e.target.value)}
              />
            </Field>

            <div className="flex justify-end py-5">
              <button
                onClick={saveModel}
                className={[
                  "inline-flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium transition-colors",
                  saved ? "bg-success/10 text-success" : "bg-accent text-white hover:opacity-90",
                ].join(" ")}
              >
                {saved ? <><Check size={13} /> 已保存</> : "保存"}
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <Field label="Activity Bar">
              <div className="flex min-h-9 items-center">
                <Switch
                  checked={!!form.showActivityBar}
                  onChange={(checked) => setAndSave("showActivityBar", checked)}
                  label="显示 Activity Bar"
                />
              </div>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: SettingsTab;
  active: boolean;
  onClick: (id: SettingsTab) => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onClick(id)}
      className={[
        "relative h-9 px-1 text-[13px] font-medium transition-colors",
        active ? "text-text" : "text-text-faint hover:text-text",
      ].join(" ")}
    >
      {children}
      {active && <span className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-accent" />}
    </button>
  );
}

function Field({
  label,
  children,
  alignTop = false,
}: {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
}) {
  return (
    <label
      className={[
        "grid grid-cols-[170px_minmax(0,1fr)] gap-4 py-4 max-md:grid-cols-1 max-md:gap-2",
        alignTop ? "items-start" : "items-center",
      ].join(" ")}
    >
      <span className="text-[12px] font-medium uppercase tracking-wide text-text-faint">{label}</span>
      {children}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-[13px] text-text">
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 bg-bg-inset transition-colors peer-checked:bg-accent" />
        <span className="absolute left-0.5 h-4 w-4 bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
      <span>{label}</span>
    </label>
  );
}
