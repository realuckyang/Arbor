import { useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../../api";
import { api } from "../../api";
import { Check } from "lucide-react";

const emptySettings: Settings = {
  apiUrl: "",
  apiKey: "",
  model: "",
  system: "",
};

const inputClass =
  "w-full border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none transition-colors focus:border-accent";

export function SettingsPanel({ onSaved }: { onSaved?: (settings: Settings) => void }) {
  const [form, setForm] = useState<Settings>(emptySettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then((r) => {
      if (cancelled) return;
      const settings = { ...emptySettings, ...r.settings };
      setForm(settings);
    });
    return () => { cancelled = true; };
  }, []);

  const saveModel = async () => {
    const result = await api.saveSettings(form);
    const settings = { ...emptySettings, ...result.settings };
    setForm(settings);
    onSaved?.(result.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-4xl px-5 py-6 md:px-8">
        <div className="mb-5 min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-text">设置</h1>
          <div className="mt-1 text-[13px] text-text-faint">模型</div>
        </div>

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
      </div>
    </div>
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
