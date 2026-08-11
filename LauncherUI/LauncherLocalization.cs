using System;
using System.Collections.Generic;
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
                    if (LauncherLocale.IsSupported(value)) settings.Code = LauncherLocale.Normalize(value);
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
        private static readonly Dictionary<string, Dictionary<string, string>> Texts = CreateTexts();

        public static bool IsSupported(string code)
        {
            string normalized = Normalize(code);
            return normalized == "zh" || normalized == "en" || normalized == "fr" ||
                normalized == "es" || normalized == "ru" || normalized == "ar";
        }

        public static string Normalize(string code)
        {
            if (String.IsNullOrWhiteSpace(code)) return "en";
            string normalized = code.Trim().ToLowerInvariant();
            int separator = normalized.IndexOf('-');
            int underscore = normalized.IndexOf('_');
            if (separator < 0 || (underscore >= 0 && underscore < separator)) separator = underscore;
            if (separator > 0) normalized = normalized.Substring(0, separator);
            return normalized;
        }

        public static string TranslationCode(string code)
        {
            string normalized = Normalize(code);
            if (normalized == "zh") return "zh-CN";
            return IsSupported(normalized) ? normalized : "en";
        }

        public static string Text(string code, string key)
        {
            if (String.IsNullOrEmpty(key)) return String.Empty;

            Dictionary<string, string> language;
            string value;
            if (Texts.TryGetValue(Normalize(code), out language) && language.TryGetValue(key, out value))
                return value;
            if (Texts["en"].TryGetValue(key, out value)) return value;
            return key;
        }

        public static string Format(string code, string key, params object[] args)
        {
            string template = Text(code, key);
            if (args == null || args.Length == 0) return template;
            try
            {
                return String.Format(CultureInfo.InvariantCulture, template, args);
            }
            catch (FormatException)
            {
                return template;
            }
        }

        public static string Pick(string code, string zh, string en, string fr,
            string es, string ru, string ar)
        {
            switch (Normalize(code))
            {
                case "zh": return zh;
                case "fr": return fr;
                case "es": return es;
                case "ru": return ru;
                case "ar": return ar;
                default: return en;
            }
        }

        private static Dictionary<string, Dictionary<string, string>> CreateTexts()
        {
            Dictionary<string, Dictionary<string, string>> all =
                new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);

            AddLanguage(all, "zh",
                "window.settings", "设置",
                "button.close", "关闭",
                "section.general", "常规",
                "summary.general.on", "自动关闭 开 · {0}",
                "summary.general.off", "自动关闭 关 · {0}",
                "section.window", "窗口",
                "summary.window", "普通窗口 · 自动清理",
                "section.appearance", "外观",
                "theme.glass", "毛玻璃",
                "theme.classic", "经典黑",
                "theme.system", "系统",
                "theme.black", "黑色",
                "section.storage", "日志与存储",
                "summary.storage", "{0} 会话 · {1} {2}",
                "unit.mb", "MB",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "动态",
                "summary.activity", "{0} 个账号 · {1} 条",
                "section.games", "小游戏",
                "summary.games", "贪吃蛇 · 扫雷",
                "section.about", "更新与关于",
                "summary.about", "{0} · Windows 11",
                "language.title", "界面与翻译语言",
                "language.description", "首次启动跟随 Windows，可手动更改",
                "language.zh", "中文",
                "language.en", "English",
                "language.fr", "Français",
                "language.es", "Español",
                "language.ru", "Русский",
                "language.ar", "العربية",
                "language.restart.title", "语言已更改",
                "language.restart.message", "新语言将在重新打开启动器后生效。",
                "row.autoClose", "完成后自动关闭",
                "desc.autoClose", "无其他交互任务时释放启动器资源",
                "row.keepOpenGames", "游戏运行时保持启动器",
                "desc.keepOpenGames", "关闭最后一个游戏窗口后再自动退出",
                "row.exitCleanup", "退出清理",
                "status.enabled", "已启用",
                "status.disabled", "已关闭",
                "status.on", "开",
                "status.off", "关",
                "desc.exitCleanup", "关闭启动器时只清理自身辅助进程，不结束 ChatGPT",
                "row.glassBackground", "玻璃背景",
                "desc.glassBackground", "选择窗口材质",
                "row.panelOpacity", "玻璃面板",
                "desc.panelOpacity", "调整内容层的透明与背景深度",
                "row.tintStrength", "色调强度",
                "desc.tintStrength", "调整冷色边缘高光与玻璃染色",
                "row.reduceMotion", "减少动态效果",
                "desc.reduceMotion", "减少粒子与界面过渡",
                "row.backupRetention", "正式备份保留数",
                "row.logSessions", "保留日志会话",
                "row.uiLogLines", "实时日志行数",
                "row.logTotalLimit", "日志总上限",
                "desc.logTotalLimit", "超出后按旧到新清理",
                "button.openLogs", "打开 Logs 目录",
                "row.enableActivity", "开启动态功能",
                "desc.enableActivity", "关闭后不显示公开动态窗口",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "显示动态",
                "row.readerFallback", "Jina Reader 后备",
                "desc.readerFallback", "RSS 失效时降级读取公开页面",
                "button.openActivity", "打开动态",
                "status.installed", "已安装",
                "games.value", "贪吃蛇、扫雷",
                "desc.games", "游戏运行时可保持启动器不自动关闭",
                "button.chooseGame", "选择小游戏",
                "row.currentVersion", "当前版本",
                "desc.about", "自适应插件修复、动态聚合与本地小游戏",
                "button.checkUpdate", "检查并安装更新",
                "disclaimer", "设置中心采用原创 WPF 实现。视觉上参考现代开源监控工具的紧凑折叠信息架构，未复制其源代码或资产。");

            AddLanguage(all, "en",
                "window.settings", "Settings",
                "button.close", "Close",
                "section.general", "General",
                "summary.general.on", "Auto-close on · {0}",
                "summary.general.off", "Auto-close off · {0}",
                "section.window", "Window",
                "summary.window", "Standard window · automatic cleanup",
                "section.appearance", "Appearance",
                "theme.glass", "Glass",
                "theme.classic", "Classic",
                "theme.system", "System",
                "theme.black", "Black",
                "section.storage", "Logs & storage",
                "summary.storage", "{0} sessions · {1} {2}",
                "unit.mb", "MB",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "Activity",
                "summary.activity", "{0} accounts · {1} posts",
                "section.games", "Mini-games",
                "summary.games", "Snake · Minesweeper",
                "section.about", "Updates & about",
                "summary.about", "{0} · Windows 11",
                "language.title", "Interface and translation language",
                "language.description", "Detected from Windows on first run",
                "language.zh", "Chinese",
                "language.en", "English",
                "language.fr", "French",
                "language.es", "Spanish",
                "language.ru", "Russian",
                "language.ar", "Arabic",
                "language.restart.title", "Language changed",
                "language.restart.message", "The new language will take effect after you restart the launcher.",
                "row.autoClose", "Close automatically after completion",
                "desc.autoClose", "Release launcher resources when no other interactive task is running",
                "row.keepOpenGames", "Keep launcher open while gaming",
                "desc.keepOpenGames", "Exit automatically after the last game window closes",
                "row.exitCleanup", "Exit cleanup",
                "status.enabled", "Enabled",
                "status.disabled", "Disabled",
                "status.on", "On",
                "status.off", "Off",
                "desc.exitCleanup", "When the launcher closes, only its own helper processes are cleaned up; ChatGPT is not terminated",
                "row.glassBackground", "Glass background",
                "desc.glassBackground", "Choose the window material",
                "row.panelOpacity", "Glass panel",
                "desc.panelOpacity", "Adjust content-layer transparency and background depth",
                "row.tintStrength", "Tint strength",
                "desc.tintStrength", "Adjust cool-edge highlights and glass tint",
                "row.reduceMotion", "Reduce motion",
                "desc.reduceMotion", "Reduce particles and interface transitions",
                "row.backupRetention", "Formal backup retention",
                "row.logSessions", "Retained log sessions",
                "row.uiLogLines", "Live log lines",
                "row.logTotalLimit", "Total log limit",
                "desc.logTotalLimit", "Older entries are removed first after the limit is exceeded",
                "button.openLogs", "Open Logs folder",
                "row.enableActivity", "Enable activity",
                "desc.enableActivity", "Hide the public activity window when disabled",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "Activity items",
                "row.readerFallback", "Jina Reader fallback",
                "desc.readerFallback", "Fall back to reading public pages when RSS is unavailable",
                "button.openActivity", "Open activity",
                "status.installed", "Installed",
                "games.value", "Snake, Minesweeper",
                "desc.games", "Keep the launcher open while games are running",
                "button.chooseGame", "Choose a mini-game",
                "row.currentVersion", "Current version",
                "desc.about", "Adaptive plugin repair, activity aggregation, and local mini-games",
                "button.checkUpdate", "Check for and install updates",
                "disclaimer", "The settings center is an original WPF implementation. Its compact disclosure layout is visually inspired by modern open-source monitoring tools; no third-party source code or assets were copied.");

            AddLanguage(all, "fr",
                "window.settings", "Paramètres",
                "button.close", "Fermer",
                "section.general", "Général",
                "summary.general.on", "Fermeture auto activée · {0}",
                "summary.general.off", "Fermeture auto désactivée · {0}",
                "section.window", "Fenêtre",
                "summary.window", "Fenêtre standard · nettoyage automatique",
                "section.appearance", "Apparence",
                "theme.glass", "Verre",
                "theme.classic", "Classique",
                "theme.system", "Système",
                "theme.black", "Noir",
                "section.storage", "Journaux et stockage",
                "summary.storage", "{0} sessions · {1} {2}",
                "unit.mb", "Mo",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "Activité",
                "summary.activity", "{0} comptes · {1} publications",
                "section.games", "Mini-jeux",
                "summary.games", "Snake · Démineur",
                "section.about", "Mises à jour et à propos",
                "summary.about", "{0} · Windows 11",
                "language.title", "Langue de l'interface et de traduction",
                "language.description", "Détectée depuis Windows au premier lancement",
                "language.zh", "Chinois",
                "language.en", "Anglais",
                "language.fr", "Français",
                "language.es", "Espagnol",
                "language.ru", "Russe",
                "language.ar", "Arabe",
                "language.restart.title", "Langue modifiée",
                "language.restart.message", "La nouvelle langue prendra effet après le redémarrage du lanceur.",
                "row.autoClose", "Fermer automatiquement à la fin",
                "desc.autoClose", "Libérer les ressources du lanceur lorsqu'aucune autre tâche interactive ne s'exécute",
                "row.keepOpenGames", "Garder le lanceur ouvert pendant les jeux",
                "desc.keepOpenGames", "Quitter automatiquement après la fermeture de la dernière fenêtre de jeu",
                "row.exitCleanup", "Nettoyage à la fermeture",
                "status.enabled", "Activé",
                "status.disabled", "Désactivé",
                "status.on", "Oui",
                "status.off", "Non",
                "desc.exitCleanup", "À la fermeture, seuls les processus auxiliaires du lanceur sont nettoyés ; ChatGPT n'est pas arrêté",
                "row.glassBackground", "Arrière-plan en verre",
                "desc.glassBackground", "Choisir le matériau de la fenêtre",
                "row.panelOpacity", "Panneau en verre",
                "desc.panelOpacity", "Régler la transparence du contenu et la profondeur de l'arrière-plan",
                "row.tintStrength", "Intensité de teinte",
                "desc.tintStrength", "Régler les reflets froids des bords et la teinte du verre",
                "row.reduceMotion", "Réduire les animations",
                "desc.reduceMotion", "Réduire les particules et les transitions de l'interface",
                "row.backupRetention", "Nombre de sauvegardes conservées",
                "row.logSessions", "Sessions de journal conservées",
                "row.uiLogLines", "Lignes de journal en direct",
                "row.logTotalLimit", "Limite totale du journal",
                "desc.logTotalLimit", "Les entrées les plus anciennes sont supprimées en premier une fois la limite dépassée",
                "button.openLogs", "Ouvrir le dossier Logs",
                "row.enableActivity", "Activer l'activité",
                "desc.enableActivity", "Masquer la fenêtre d'activité publique si désactivé",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "Éléments d'activité",
                "row.readerFallback", "Secours Jina Reader",
                "desc.readerFallback", "Lire les pages publiques si le flux RSS est indisponible",
                "button.openActivity", "Ouvrir l'activité",
                "status.installed", "Installés",
                "games.value", "Snake, Démineur",
                "desc.games", "Garder le lanceur ouvert pendant les jeux",
                "button.chooseGame", "Choisir un mini-jeu",
                "row.currentVersion", "Version actuelle",
                "desc.about", "Réparation adaptative des plugins, agrégation d'activité et mini-jeux locaux",
                "button.checkUpdate", "Rechercher et installer les mises à jour",
                "disclaimer", "Le centre de paramètres est une implémentation WPF originale. Sa structure compacte à sections repliables s'inspire visuellement d'outils de supervision open source modernes ; aucun code ni aucune ressource tiers n'a été copié.");

            AddLanguage(all, "es",
                "window.settings", "Configuración",
                "button.close", "Cerrar",
                "section.general", "General",
                "summary.general.on", "Cierre automático activado · {0}",
                "summary.general.off", "Cierre automático desactivado · {0}",
                "section.window", "Ventana",
                "summary.window", "Ventana normal · limpieza automática",
                "section.appearance", "Apariencia",
                "theme.glass", "Vidrio",
                "theme.classic", "Clásico",
                "theme.system", "Sistema",
                "theme.black", "Negro",
                "section.storage", "Registros y almacenamiento",
                "summary.storage", "{0} sesiones · {1} {2}",
                "unit.mb", "MB",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "Actividad",
                "summary.activity", "{0} cuentas · {1} publicaciones",
                "section.games", "Minijuegos",
                "summary.games", "Snake · Buscaminas",
                "section.about", "Actualizaciones y acerca de",
                "summary.about", "{0} · Windows 11",
                "language.title", "Idioma de la interfaz y la traducción",
                "language.description", "Se detecta desde Windows en el primer inicio",
                "language.zh", "Chino",
                "language.en", "Inglés",
                "language.fr", "Francés",
                "language.es", "Español",
                "language.ru", "Ruso",
                "language.ar", "Árabe",
                "language.restart.title", "Idioma cambiado",
                "language.restart.message", "El nuevo idioma se aplicará después de reiniciar el iniciador.",
                "row.autoClose", "Cerrar automáticamente al completar",
                "desc.autoClose", "Liberar los recursos del iniciador cuando no haya otra tarea interactiva en ejecución",
                "row.keepOpenGames", "Mantener el iniciador abierto durante los juegos",
                "desc.keepOpenGames", "Salir automáticamente después de cerrar la última ventana de juego",
                "row.exitCleanup", "Limpieza al salir",
                "status.enabled", "Activado",
                "status.disabled", "Desactivado",
                "status.on", "Sí",
                "status.off", "No",
                "desc.exitCleanup", "Al cerrar el iniciador solo se limpian sus procesos auxiliares; ChatGPT no se termina",
                "row.glassBackground", "Fondo de vidrio",
                "desc.glassBackground", "Elegir el material de la ventana",
                "row.panelOpacity", "Panel de vidrio",
                "desc.panelOpacity", "Ajustar la transparencia de la capa de contenido y la profundidad del fondo",
                "row.tintStrength", "Intensidad del tono",
                "desc.tintStrength", "Ajustar los reflejos fríos de los bordes y el tinte del vidrio",
                "row.reduceMotion", "Reducir movimiento",
                "desc.reduceMotion", "Reducir las partículas y las transiciones de la interfaz",
                "row.backupRetention", "Copias de seguridad conservadas",
                "row.logSessions", "Sesiones de registro conservadas",
                "row.uiLogLines", "Líneas de registro en directo",
                "row.logTotalLimit", "Límite total del registro",
                "desc.logTotalLimit", "Las entradas más antiguas se eliminan primero al superar el límite",
                "button.openLogs", "Abrir carpeta Logs",
                "row.enableActivity", "Activar actividad",
                "desc.enableActivity", "Ocultar la ventana de actividad pública cuando esté desactivado",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "Elementos de actividad",
                "row.readerFallback", "Respaldo de Jina Reader",
                "desc.readerFallback", "Leer páginas públicas como alternativa cuando RSS no esté disponible",
                "button.openActivity", "Abrir actividad",
                "status.installed", "Instalados",
                "games.value", "Snake, Buscaminas",
                "desc.games", "Mantener el iniciador abierto mientras se ejecutan los juegos",
                "button.chooseGame", "Elegir un minijuego",
                "row.currentVersion", "Versión actual",
                "desc.about", "Reparación adaptable de plugins, agregación de actividad y minijuegos locales",
                "button.checkUpdate", "Buscar e instalar actualizaciones",
                "disclaimer", "El centro de configuración es una implementación WPF original. Su estructura compacta de secciones plegables se inspira visualmente en herramientas modernas de monitorización de código abierto; no se copiaron código ni recursos de terceros.");

            AddLanguage(all, "ru",
                "window.settings", "Настройки",
                "button.close", "Закрыть",
                "section.general", "Общие",
                "summary.general.on", "Автозакрытие включено · {0}",
                "summary.general.off", "Автозакрытие выключено · {0}",
                "section.window", "Окно",
                "summary.window", "Обычное окно · автоматическая очистка",
                "section.appearance", "Внешний вид",
                "theme.glass", "Стекло",
                "theme.classic", "Классическая",
                "theme.system", "Системная",
                "theme.black", "Чёрная",
                "section.storage", "Журналы и хранилище",
                "summary.storage", "{0} сеанс. · {1} {2}",
                "unit.mb", "МБ",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "Лента",
                "summary.activity", "{0} аккаунт. · {1} записей",
                "section.games", "Мини-игры",
                "summary.games", "Змейка · Сапёр",
                "section.about", "Обновления и сведения",
                "summary.about", "{0} · Windows 11",
                "language.title", "Язык интерфейса и перевода",
                "language.description", "Определяется Windows при первом запуске",
                "language.zh", "Китайский",
                "language.en", "Английский",
                "language.fr", "Французский",
                "language.es", "Испанский",
                "language.ru", "Русский",
                "language.ar", "Арабский",
                "language.restart.title", "Язык изменён",
                "language.restart.message", "Новый язык вступит в силу после перезапуска лаунчера.",
                "row.autoClose", "Закрывать после завершения",
                "desc.autoClose", "Освобождать ресурсы лаунчера, если нет других интерактивных задач",
                "row.keepOpenGames", "Оставлять лаунчер открытым во время игр",
                "desc.keepOpenGames", "Выходить автоматически после закрытия последнего игрового окна",
                "row.exitCleanup", "Очистка при выходе",
                "status.enabled", "Включено",
                "status.disabled", "Выключено",
                "status.on", "Вкл.",
                "status.off", "Выкл.",
                "desc.exitCleanup", "При закрытии лаунчера очищаются только его вспомогательные процессы; ChatGPT не завершается",
                "row.glassBackground", "Стеклянный фон",
                "desc.glassBackground", "Выбрать материал окна",
                "row.panelOpacity", "Стеклянная панель",
                "desc.panelOpacity", "Настроить прозрачность слоя содержимого и глубину фона",
                "row.tintStrength", "Интенсивность оттенка",
                "desc.tintStrength", "Настроить холодные блики по краям и оттенок стекла",
                "row.reduceMotion", "Уменьшить анимацию",
                "desc.reduceMotion", "Уменьшить частицы и переходы интерфейса",
                "row.backupRetention", "Количество сохраняемых резервных копий",
                "row.logSessions", "Сохраняемые сеансы журнала",
                "row.uiLogLines", "Строк журнала в реальном времени",
                "row.logTotalLimit", "Общий лимит журнала",
                "desc.logTotalLimit", "После превышения лимита сначала удаляются самые старые записи",
                "button.openLogs", "Открыть папку Logs",
                "row.enableActivity", "Включить ленту",
                "desc.enableActivity", "Не показывать публичную ленту, если функция выключена",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "Количество записей",
                "row.readerFallback", "Резерв Jina Reader",
                "desc.readerFallback", "Читать публичные страницы, если RSS недоступен",
                "button.openActivity", "Открыть ленту",
                "status.installed", "Установлено",
                "games.value", "Змейка, Сапёр",
                "desc.games", "Оставлять лаунчер открытым во время работы игр",
                "button.chooseGame", "Выбрать мини-игру",
                "row.currentVersion", "Текущая версия",
                "desc.about", "Адаптивное восстановление плагинов, сбор ленты и локальные мини-игры",
                "button.checkUpdate", "Проверить и установить обновления",
                "disclaimer", "Центр настроек — оригинальная реализация WPF. Его компактная структура сворачиваемых разделов визуально вдохновлена современными инструментами мониторинга с открытым исходным кодом; исходный код и ресурсы сторонних разработчиков не копировались.");

            AddLanguage(all, "ar",
                "window.settings", "الإعدادات",
                "button.close", "إغلاق",
                "section.general", "عام",
                "summary.general.on", "الإغلاق التلقائي مفعّل · {0}",
                "summary.general.off", "الإغلاق التلقائي غير مفعّل · {0}",
                "section.window", "النافذة",
                "summary.window", "نافذة عادية · تنظيف تلقائي",
                "section.appearance", "المظهر",
                "theme.glass", "زجاجي",
                "theme.classic", "كلاسيكي",
                "theme.system", "النظام",
                "theme.black", "أسود",
                "section.storage", "السجلات والتخزين",
                "summary.storage", "{0} جلسة · {1} {2}",
                "unit.mb", "ميجابايت",
                "status.maxLogSize", "{0} {1}",
                "section.activity", "النشاط",
                "summary.activity", "{0} حساب · {1} منشور",
                "section.games", "ألعاب صغيرة",
                "summary.games", "الثعبان · كاسحة الألغام",
                "section.about", "التحديثات وحول البرنامج",
                "summary.about", "{0} · Windows 11",
                "language.title", "لغة الواجهة والترجمة",
                "language.description", "يتم اكتشافها من Windows عند التشغيل الأول",
                "language.zh", "الصينية",
                "language.en", "الإنجليزية",
                "language.fr", "الفرنسية",
                "language.es", "الإسبانية",
                "language.ru", "الروسية",
                "language.ar", "العربية",
                "language.restart.title", "تم تغيير اللغة",
                "language.restart.message", "ستظهر اللغة الجديدة بعد إعادة تشغيل المشغّل.",
                "row.autoClose", "الإغلاق تلقائياً بعد الإكمال",
                "desc.autoClose", "تحرير موارد المشغّل عند عدم وجود مهمة تفاعلية أخرى قيد التشغيل",
                "row.keepOpenGames", "إبقاء المشغّل مفتوحاً أثناء اللعب",
                "desc.keepOpenGames", "الخروج تلقائياً بعد إغلاق آخر نافذة للعبة",
                "row.exitCleanup", "التنظيف عند الخروج",
                "status.enabled", "مفعّل",
                "status.disabled", "غير مفعّل",
                "status.on", "تشغيل",
                "status.off", "إيقاف",
                "desc.exitCleanup", "عند إغلاق المشغّل، يتم تنظيف عملياته المساعدة فقط؛ ولا يتم إنهاء ChatGPT",
                "row.glassBackground", "خلفية زجاجية",
                "desc.glassBackground", "اختر مادة النافذة",
                "row.panelOpacity", "لوحة زجاجية",
                "desc.panelOpacity", "اضبط شفافية طبقة المحتوى وعمق الخلفية",
                "row.tintStrength", "شدة الصبغة",
                "desc.tintStrength", "اضبط الإضاءة الباردة للحواف وصبغة الزجاج",
                "row.reduceMotion", "تقليل الحركة",
                "desc.reduceMotion", "تقليل الجسيمات وانتقالات الواجهة",
                "row.backupRetention", "عدد النسخ الاحتياطية المحفوظة",
                "row.logSessions", "جلسات السجل المحفوظة",
                "row.uiLogLines", "أسطر السجل المباشرة",
                "row.logTotalLimit", "الحد الإجمالي للسجل",
                "desc.logTotalLimit", "بعد تجاوز الحد، تتم إزالة الإدخالات الأقدم أولاً",
                "button.openLogs", "فتح مجلد Logs",
                "row.enableActivity", "تفعيل النشاط",
                "desc.enableActivity", "إخفاء نافذة النشاط العامة عند التعطيل",
                "feed.tibo", "Tibo",
                "feed.tibo.description", "@thsottiaux",
                "feed.openai", "OpenAI",
                "feed.openai.description", "@OpenAI",
                "feed.chatgpt", "ChatGPT",
                "feed.chatgpt.description", "@ChatGPT",
                "row.activityItems", "عناصر النشاط",
                "row.readerFallback", "خيار Jina Reader الاحتياطي",
                "desc.readerFallback", "قراءة الصفحات العامة عند عدم توفر RSS",
                "button.openActivity", "فتح النشاط",
                "status.installed", "مثبّتة",
                "games.value", "الثعبان، كاسحة الألغام",
                "desc.games", "إبقاء المشغّل مفتوحاً أثناء تشغيل الألعاب",
                "button.chooseGame", "اختيار لعبة صغيرة",
                "row.currentVersion", "الإصدار الحالي",
                "desc.about", "إصلاح متكيف للإضافات، وتجميع النشاط، وألعاب محلية صغيرة",
                "button.checkUpdate", "التحقق من التحديثات وتثبيتها",
                "disclaimer", "مركز الإعدادات تنفيذ أصلي باستخدام WPF. يستلهم تصميمه المرئي ذو الأقسام القابلة للطي من أدوات المراقبة الحديثة مفتوحة المصدر؛ ولم يتم نسخ أي كود أو أصول من طرف ثالث.");

            return all;
        }

        private static void AddLanguage(
            Dictionary<string, Dictionary<string, string>> all,
            string code,
            params string[] pairs)
        {
            if (pairs.Length % 2 != 0) throw new ArgumentException("Translation pairs must contain a key and value.");
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 0; i < pairs.Length; i += 2) values[pairs[i]] = pairs[i + 1];
            all[code] = values;
        }
    }
}
