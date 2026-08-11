using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace WinBridgeRecovery
{
    public sealed class LauncherLanguageSettings
    {
        public string Code = DetectSystemLanguage();

        public static LauncherLanguageSettings Load(string root)
        {
            LauncherLanguageSettings settings = new LauncherLanguageSettings();
            string path = Path.Combine(root, "LauncherUI", "State", "language.ini");
            try
            {
                if (File.Exists(path))
                {
                    string value = File.ReadAllText(path, Encoding.UTF8).Trim();
                    if (LauncherLocale.IsSupported(value)) settings.Code = value;
                }
            }
            catch { }
            return settings;
        }

        public void Save(string root)
        {
            string path = Path.Combine(root, "LauncherUI", "State", "language.ini");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, Code, new UTF8Encoding(false));
        }

        private static string DetectSystemLanguage()
        {
            string name = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.ToLowerInvariant();
            return LauncherLocale.IsSupported(name) ? name : "en";
        }
    }

    public static class LauncherLocale
    {
        public static bool IsSupported(string code)
        {
            return code == "zh" || code == "en" || code == "fr" ||
                code == "es" || code == "ru" || code == "ar";
        }

        public static string TranslationCode(string code)
        {
            if (code == "zh") return "zh-CN";
            return IsSupported(code) ? code : "en";
        }

        public static string Pick(string code, string zh, string en, string fr,
            string es, string ru, string ar)
        {
            switch (code)
            {
                case "zh": return zh;
                case "fr": return fr;
                case "es": return es;
                case "ru": return ru;
                case "ar": return ar;
                default: return en;
            }
        }
    }
}
