import { useI18n } from '../i18n';

/** Language (English / Hindi) and a larger-text switch. Hidden when printing. */
export default function LangToggle() {
  const { lang, setLang, large, setLargeText, t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-4 print:hidden">
      <div role="group" aria-label={t('common.language')} className="inline-flex overflow-hidden rounded-md border border-line bg-white">
        {(['en', 'hi'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={`px-4 py-2 font-semibold ${lang === l ? 'bg-ink text-white' : 'hover:bg-paper'}`}
          >
            {l === 'en' ? 'English' : 'हिन्दी'}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={large} onChange={(e) => setLargeText(e.target.checked)} />
        {t('common.largerText')}
      </label>
    </div>
  );
}
