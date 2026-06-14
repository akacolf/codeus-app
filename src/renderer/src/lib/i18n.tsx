import type React from 'react'
import { useEffect } from 'react'
import { IntlProvider } from 'use-intl'
import { languageById, useSettings, type LanguageId } from './settings'

type Messages = Record<string, unknown>

const EN: Messages = {
  toolbar: {
    settings: 'Settings'
  },
  settings: {
    backToApp: 'Back to app',
    nav: {
      general: 'General',
      appearance: 'Appearance',
      editor: 'Editor',
      terminal: 'Terminal',
      system: 'System',
      shortcuts: 'Keyboard shortcuts',
      mcp: 'MCP servers',
      connections: 'Connections',
      privacy: 'Privacy & data',
      usage: 'Usage & billing'
    },
    general: {
      title: 'General',
      workMode: 'Work mode',
      workModeHint: 'Choose how much technical detail Codeus shows.',
      workModeCoding: 'For coding',
      workModeCodingHint: 'More technical responses and control.',
      workModeEveryday: 'For everyday work',
      workModeEverydayHint: 'Same power, less technical detail.',
      displayName: 'Display name',
      displayNameHint: 'Shown in the home greeting.',
      language: 'Language',
      languageHint: 'Language for the app UI.',
      systemLanguage: 'System language',
      sendMessages: 'Send messages',
      sendMessagesHint: 'Choose whether Enter sends or adds a line.',
      submitEnter: 'Enter',
      submitEnterHint: 'Shift+Enter inserts a new line.',
      submitModEnter: 'Cmd/Ctrl+Enter',
      submitModEnterHint: 'Enter inserts a new line.',
      defaultRuntime: 'Default terminal runtime',
      defaultRuntimeHint: 'Used for newly opened tabs.',
      localRuntime: 'Local',
      localRuntimeHint: 'Run commands on this Mac.',
      cloudRuntime: 'Cloud',
      cloudRuntimeHint: 'Run commands in the sandbox.',
      sidebar: 'Sidebar',
      sidebarHint: 'Open the chat sidebar when Codeus starts.',
      openSidebarOnLaunch: 'Open sidebar on launch',
      runtimeBehavior: 'Runtime behavior',
      runtimeBehaviorHint: 'Control how Codeus runs in the background.',
      preventSleep: 'Prevent sleep while running',
      showTrayIcon: 'Show in the menu bar',
      projectlessChat: 'Default to projectless chat',
      suggestedPrompts: 'Suggested prompts',
      speed: 'Speed',
      speedHint: 'Choose how quickly inference runs across chats.',
      speedStandard: 'Standard',
      speedFast: 'Fast',
      speedDeliberate: 'Deliberate',
      notifications: 'Notifications',
      notificationsHint: 'Control when Codeus alerts you.',
      notifyUnfocused: 'Only when unfocused',
      notifyAlways: 'Always',
      notifyNever: 'Never',
      permissionNotifications: 'Enable permission notifications',
      questionNotifications: 'Alert when Codeus asks a question',
      followUp: 'Follow-up while streaming',
      followUpHint: 'What happens when you send a new message mid-reply.',
      followUpQueue: 'Queue',
      followUpQueueHint: 'Send after the current reply finishes.',
      followUpSteer: 'Steer',
      followUpSteerHint: 'Cancel the current reply and start over with your new prompt.',
      openDestination: 'Open files in',
      openDestinationHint: 'Where citations and file references open by default.',
      openEditor: 'Editor',
      openTerminal: 'Terminal',
      openFinder: 'Finder'
    },
    appearance: {
      title: 'Appearance',
      theme: 'Theme',
      themeHint: 'Match your OS or pin a side.',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      interfaceSize: 'Interface size',
      interfaceSizeHint: 'Scales the app chrome and chat text.',
      scaleSmall: 'Small',
      scaleDefault: 'Default',
      scaleLarge: 'Large',
      fontFamily: 'Font family',
      fontFamilyHint: 'Choose the interface font.',
      fontSystem: 'System',
      chatDensity: 'Chat density',
      chatDensityHint: 'Adjust spacing in conversations.',
      densityComfortable: 'Comfortable',
      densityCompact: 'Compact',
      densitySpacious: 'Spacious',
      messageStyle: 'Message style',
      messageStyleHint: 'Choose how your messages render.',
      messageBubble: 'Bubble',
      messageMinimal: 'Minimal',
      composerSize: 'Composer size',
      composerSizeHint: 'Adjust the prompt composer height.',
      sizeCompact: 'Compact',
      sizeDefault: 'Default',
      sizeLarge: 'Large',
      sidebarWidth: 'Sidebar width',
      sidebarWidthHint: 'Choose how much room chat history gets.',
      widthNarrow: 'Narrow',
      widthDefault: 'Default',
      widthWide: 'Wide',
      editorFontSize: 'Editor font size',
      editorFontSizeHint: 'Applies to Monaco editor panes.',
      terminalFontSize: 'Terminal font size',
      terminalFontSizeHint: 'Applies to in-app terminal tabs.',
      codeTheme: 'Code theme',
      codeThemeHint: 'Applies to rendered code blocks.',
      codeThemeDimmed: 'Dimmed',
      codeThemeDark: 'Dark',
      codeThemeLight: 'Light',
      motion: 'Motion',
      motionHint: 'Reduce interface animations and transitions.',
      reduceMotion: 'Reduce motion',
      pointerCursors: 'Pointer cursor on controls'
    }
  }
}

const PARTIAL_MESSAGES: Record<string, Messages> = {
  tr: {
    toolbar: { settings: 'Ayarlar' },
    settings: {
      backToApp: 'Uygulamaya dön',
      nav: {
        general: 'Genel',
        appearance: 'Görünüm',
        shortcuts: 'Klavye kestirmeleri',
        mcp: 'MCP sunucuları',
        connections: 'Bağlantılar',
        usage: 'Kullanım ve faturalandırma'
      },
      general: {
        title: 'Genel',
        workMode: 'Çalışma modu',
        workModeHint: 'Codeus’un ne kadar teknik ayrıntı göstereceğini seç.',
        workModeCoding: 'Kodlama için',
        workModeCodingHint: 'Daha teknik yanıtlar ve daha fazla kontrol.',
        workModeEveryday: 'Günlük işler için',
        workModeEverydayHint: 'Aynı güç, daha az teknik ayrıntı.',
        displayName: 'Görünen ad',
        displayNameHint: 'Ana ekrandaki selamlamada gösterilir.',
        language: 'Dil',
        languageHint: 'Uygulama arayüzü dili.',
        systemLanguage: 'Sistem dili',
        sendMessages: 'Mesaj gönderme',
        sendMessagesHint: 'Enter mesaj göndersin mi yoksa satır mı eklesin seç.',
        submitEnter: 'Enter',
        submitEnterHint: 'Shift+Enter yeni satır ekler.',
        submitModEnter: 'Cmd/Ctrl+Enter',
        submitModEnterHint: 'Enter yeni satır ekler.',
        defaultRuntime: 'Varsayılan terminal ortamı',
        defaultRuntimeHint: 'Yeni sekmelerde kullanılır.',
        localRuntime: 'Yerel',
        localRuntimeHint: 'Komutları bu Mac üzerinde çalıştır.',
        cloudRuntime: 'Bulut',
        cloudRuntimeHint: 'Komutları sandbox içinde çalıştır.',
        sidebar: 'Kenar çubuğu',
        sidebarHint: 'Codeus açıldığında sohbet kenar çubuğunu aç.',
        openSidebarOnLaunch: 'Başlangıçta kenar çubuğunu aç',
        runtimeBehavior: 'Çalışma davranışı',
        runtimeBehaviorHint: 'Codeus’un arka planda nasıl çalışacağını denetle.',
        preventSleep: 'Çalışırken uyumayı engelle',
        projectlessChat: 'Varsayılan olarak projesiz sohbet',
        suggestedPrompts: 'Önerilen istemler',
        speed: 'Hız',
        speedHint: 'Sohbetlerde çıkarımın ne kadar hızlı çalışacağını seç.',
        speedStandard: 'Standart',
        speedFast: 'Hızlı',
        speedDeliberate: 'Düşünerek',
        notifications: 'Bildirimler',
        notificationsHint: 'Codeus’un ne zaman uyarı vereceğini denetle.',
        notifyUnfocused: 'Yalnızca odakta değilken',
        notifyAlways: 'Her zaman',
        notifyNever: 'Asla',
        permissionNotifications: 'İzin bildirimlerini etkinleştir'
      },
      appearance: {
        title: 'Görünüm',
        theme: 'Tema',
        themeHint: 'İşletim sistemini izle veya sabit bir tema seç.',
        themeSystem: 'Sistem',
        themeLight: 'Açık',
        themeDark: 'Koyu',
        interfaceSize: 'Arayüz boyutu',
        interfaceSizeHint: 'Uygulama kontrollerini ve sohbet metnini ölçekler.',
        scaleSmall: 'Küçük',
        scaleDefault: 'Varsayılan',
        scaleLarge: 'Büyük',
        fontFamily: 'Yazı tipi ailesi',
        fontFamilyHint: 'Arayüz yazı tipini seç.',
        fontSystem: 'Sistem',
        chatDensity: 'Sohbet yoğunluğu',
        chatDensityHint: 'Konuşmalardaki boşluğu ayarla.',
        densityComfortable: 'Rahat',
        densityCompact: 'Sıkı',
        densitySpacious: 'Geniş',
        messageStyle: 'Mesaj stili',
        messageStyleHint: 'Mesajlarının nasıl görüneceğini seç.',
        messageBubble: 'Balon',
        messageMinimal: 'Minimal',
        composerSize: 'Yazma alanı boyutu',
        composerSizeHint: 'İstem yazma alanının yüksekliğini ayarla.',
        sizeCompact: 'Sıkı',
        sizeDefault: 'Varsayılan',
        sizeLarge: 'Büyük',
        sidebarWidth: 'Kenar çubuğu genişliği',
        sidebarWidthHint: 'Sohbet geçmişine ayrılan alanı seç.',
        widthNarrow: 'Dar',
        widthDefault: 'Varsayılan',
        widthWide: 'Geniş',
        editorFontSize: 'Editör yazı boyutu',
        editorFontSizeHint: 'Monaco editör panellerine uygulanır.',
        terminalFontSize: 'Terminal yazı boyutu',
        terminalFontSizeHint: 'Uygulama içi terminal sekmelerine uygulanır.',
        codeTheme: 'Kod teması',
        codeThemeHint: 'Görüntülenen kod bloklarına uygulanır.',
        codeThemeDimmed: 'Soluk',
        codeThemeDark: 'Koyu',
        codeThemeLight: 'Açık',
        motion: 'Hareket',
        motionHint: 'Arayüz animasyonlarını ve geçişlerini azalt.',
        reduceMotion: 'Hareketi azalt',
        pointerCursors: 'Kontrollerde işaretçi imleci'
      }
    }
  },
  es: {
    toolbar: { settings: 'Ajustes' },
    settings: {
      nav: { general: 'General', appearance: 'Apariencia', shortcuts: 'Atajos de teclado' },
      general: {
        title: 'General',
        workMode: 'Modo de trabajo',
        displayName: 'Nombre visible',
        language: 'Idioma',
        systemLanguage: 'Idioma del sistema',
        sendMessages: 'Enviar mensajes',
        defaultRuntime: 'Terminal predeterminada',
        sidebar: 'Barra lateral',
        runtimeBehavior: 'Comportamiento',
        preventSleep: 'Evitar reposo mientras se ejecuta',
        projectlessChat: 'Usar chat sin proyecto por defecto',
        suggestedPrompts: 'Sugerencias',
        speed: 'Velocidad',
        notifications: 'Notificaciones',
        notifyUnfocused: 'Solo sin foco',
        notifyAlways: 'Siempre',
        notifyNever: 'Nunca',
        permissionNotifications: 'Activar notificaciones de permisos'
      },
      appearance: {
        title: 'Apariencia',
        theme: 'Tema',
        themeSystem: 'Sistema',
        themeLight: 'Claro',
        themeDark: 'Oscuro',
        interfaceSize: 'Tamaño de interfaz',
        fontFamily: 'Fuente',
        fontSystem: 'Sistema',
        chatDensity: 'Densidad del chat',
        messageStyle: 'Estilo de mensaje',
        composerSize: 'Tamaño del compositor',
        sidebarWidth: 'Ancho de barra lateral',
        codeTheme: 'Tema de código',
        motion: 'Movimiento',
        reduceMotion: 'Reducir movimiento',
        pointerCursors: 'Cursor de puntero en controles'
      }
    }
  },
  fr: {
    toolbar: { settings: 'Réglages' },
    settings: {
      nav: { general: 'Général', appearance: 'Apparence', shortcuts: 'Raccourcis clavier' },
      general: {
        title: 'Général',
        workMode: 'Mode de travail',
        displayName: 'Nom affiché',
        language: 'Langue',
        systemLanguage: 'Langue du système',
        sendMessages: 'Envoi des messages',
        defaultRuntime: 'Terminal par défaut',
        sidebar: 'Barre latérale',
        runtimeBehavior: 'Comportement',
        preventSleep: 'Empêcher la veille pendant l’exécution',
        projectlessChat: 'Chat sans projet par défaut',
        suggestedPrompts: 'Suggestions',
        speed: 'Vitesse',
        notifications: 'Notifications',
        notifyUnfocused: 'Seulement hors focus',
        notifyAlways: 'Toujours',
        notifyNever: 'Jamais',
        permissionNotifications: 'Activer les notifications d’autorisations'
      },
      appearance: {
        title: 'Apparence',
        theme: 'Thème',
        themeSystem: 'Système',
        themeLight: 'Clair',
        themeDark: 'Sombre',
        interfaceSize: 'Taille de l’interface',
        fontFamily: 'Police',
        fontSystem: 'Système',
        chatDensity: 'Densité du chat',
        messageStyle: 'Style des messages',
        composerSize: 'Taille du composeur',
        sidebarWidth: 'Largeur de la barre latérale',
        codeTheme: 'Thème du code',
        motion: 'Mouvement',
        reduceMotion: 'Réduire les animations',
        pointerCursors: 'Curseur pointeur sur les contrôles'
      }
    }
  },
  de: {
    toolbar: { settings: 'Einstellungen' },
    settings: {
      nav: { general: 'Allgemein', appearance: 'Darstellung', shortcuts: 'Tastenkürzel' },
      general: {
        title: 'Allgemein',
        workMode: 'Arbeitsmodus',
        displayName: 'Anzeigename',
        language: 'Sprache',
        systemLanguage: 'Systemsprache',
        sendMessages: 'Nachrichten senden',
        defaultRuntime: 'Standard-Terminal',
        sidebar: 'Seitenleiste',
        runtimeBehavior: 'Laufzeitverhalten',
        preventSleep: 'Ruhezustand während der Ausführung verhindern',
        projectlessChat: 'Standardmäßig ohne Projekt chatten',
        suggestedPrompts: 'Vorgeschlagene Prompts',
        speed: 'Geschwindigkeit',
        notifications: 'Benachrichtigungen',
        notifyUnfocused: 'Nur ohne Fokus',
        notifyAlways: 'Immer',
        notifyNever: 'Nie',
        permissionNotifications: 'Berechtigungsbenachrichtigungen aktivieren'
      },
      appearance: {
        title: 'Darstellung',
        theme: 'Design',
        themeSystem: 'System',
        themeLight: 'Hell',
        themeDark: 'Dunkel',
        interfaceSize: 'Oberflächengröße',
        fontFamily: 'Schriftart',
        fontSystem: 'System',
        chatDensity: 'Chat-Dichte',
        messageStyle: 'Nachrichtenstil',
        composerSize: 'Composer-Größe',
        sidebarWidth: 'Breite der Seitenleiste',
        codeTheme: 'Code-Design',
        motion: 'Bewegung',
        reduceMotion: 'Bewegung reduzieren',
        pointerCursors: 'Zeiger-Cursor für Steuerelemente'
      }
    }
  },
  it: {
    toolbar: { settings: 'Impostazioni' },
    settings: {
      nav: { general: 'Generali', appearance: 'Aspetto', shortcuts: 'Scorciatoie' },
      general: {
        title: 'Generali',
        workMode: 'Modalità di lavoro',
        displayName: 'Nome visualizzato',
        language: 'Lingua',
        systemLanguage: 'Lingua di sistema',
        sendMessages: 'Invio messaggi',
        defaultRuntime: 'Terminale predefinito',
        sidebar: 'Barra laterale',
        runtimeBehavior: 'Comportamento',
        preventSleep: 'Impedisci stop durante l’esecuzione',
        projectlessChat: 'Chat senza progetto predefinita',
        suggestedPrompts: 'Prompt suggeriti',
        speed: 'Velocità',
        notifications: 'Notifiche',
        notifyUnfocused: 'Solo senza focus',
        notifyAlways: 'Sempre',
        notifyNever: 'Mai',
        permissionNotifications: 'Abilita notifiche permessi'
      },
      appearance: {
        title: 'Aspetto',
        theme: 'Tema',
        themeSystem: 'Sistema',
        themeLight: 'Chiaro',
        themeDark: 'Scuro',
        interfaceSize: 'Dimensione interfaccia',
        fontFamily: 'Carattere',
        fontSystem: 'Sistema',
        chatDensity: 'Densità chat',
        messageStyle: 'Stile messaggi',
        composerSize: 'Dimensione compositore',
        sidebarWidth: 'Larghezza barra laterale',
        codeTheme: 'Tema codice',
        motion: 'Movimento',
        reduceMotion: 'Riduci movimento',
        pointerCursors: 'Cursore puntatore sui controlli'
      }
    }
  },
  pt: {
    toolbar: { settings: 'Configurações' },
    settings: {
      nav: { general: 'Geral', appearance: 'Aparência', shortcuts: 'Atalhos de teclado' },
      general: {
        title: 'Geral',
        workMode: 'Modo de trabalho',
        displayName: 'Nome exibido',
        language: 'Idioma',
        systemLanguage: 'Idioma do sistema',
        sendMessages: 'Enviar mensagens',
        defaultRuntime: 'Terminal padrão',
        sidebar: 'Barra lateral',
        runtimeBehavior: 'Comportamento',
        preventSleep: 'Impedir repouso durante execução',
        projectlessChat: 'Usar chat sem projeto por padrão',
        suggestedPrompts: 'Sugestões',
        speed: 'Velocidade',
        notifications: 'Notificações',
        notifyUnfocused: 'Apenas sem foco',
        notifyAlways: 'Sempre',
        notifyNever: 'Nunca',
        permissionNotifications: 'Ativar notificações de permissões'
      },
      appearance: {
        title: 'Aparência',
        theme: 'Tema',
        themeSystem: 'Sistema',
        themeLight: 'Claro',
        themeDark: 'Escuro',
        interfaceSize: 'Tamanho da interface',
        fontFamily: 'Fonte',
        fontSystem: 'Sistema',
        chatDensity: 'Densidade do chat',
        messageStyle: 'Estilo de mensagem',
        composerSize: 'Tamanho do compositor',
        sidebarWidth: 'Largura da barra lateral',
        codeTheme: 'Tema de código',
        motion: 'Movimento',
        reduceMotion: 'Reduzir movimento',
        pointerCursors: 'Cursor de ponteiro nos controles'
      }
    }
  },
  ru: {
    toolbar: { settings: 'Настройки' },
    settings: {
      nav: { general: 'Общие', appearance: 'Внешний вид', shortcuts: 'Горячие клавиши' },
      general: {
        title: 'Общие',
        workMode: 'Режим работы',
        displayName: 'Отображаемое имя',
        language: 'Язык',
        systemLanguage: 'Язык системы',
        sendMessages: 'Отправка сообщений',
        defaultRuntime: 'Терминал по умолчанию',
        sidebar: 'Боковая панель',
        runtimeBehavior: 'Поведение',
        preventSleep: 'Не давать компьютеру засыпать',
        projectlessChat: 'Чат без проекта по умолчанию',
        suggestedPrompts: 'Подсказки',
        speed: 'Скорость',
        notifications: 'Уведомления',
        notifyUnfocused: 'Только без фокуса',
        notifyAlways: 'Всегда',
        notifyNever: 'Никогда',
        permissionNotifications: 'Уведомления о разрешениях'
      },
      appearance: {
        title: 'Внешний вид',
        theme: 'Тема',
        themeSystem: 'Система',
        themeLight: 'Светлая',
        themeDark: 'Темная',
        interfaceSize: 'Размер интерфейса',
        fontFamily: 'Шрифт',
        fontSystem: 'Системный',
        chatDensity: 'Плотность чата',
        messageStyle: 'Стиль сообщений',
        composerSize: 'Размер поля ввода',
        sidebarWidth: 'Ширина боковой панели',
        codeTheme: 'Тема кода',
        motion: 'Анимация',
        reduceMotion: 'Уменьшить движение',
        pointerCursors: 'Курсор-указатель на элементах'
      }
    }
  },
  ja: {
    toolbar: { settings: '設定' },
    settings: {
      nav: { general: '一般', appearance: '外観', shortcuts: 'キーボードショートカット' },
      general: {
        title: '一般',
        workMode: '作業モード',
        displayName: '表示名',
        language: '言語',
        systemLanguage: 'システム言語',
        sendMessages: 'メッセージ送信',
        defaultRuntime: '既定のターミナル',
        sidebar: 'サイドバー',
        runtimeBehavior: '実行時の動作',
        preventSleep: '実行中はスリープしない',
        projectlessChat: '既定でプロジェクトなしチャット',
        suggestedPrompts: '提案プロンプト',
        speed: '速度',
        notifications: '通知',
        notifyUnfocused: 'フォーカス外のみ',
        notifyAlways: '常に',
        notifyNever: 'なし',
        permissionNotifications: '権限通知を有効にする'
      },
      appearance: {
        title: '外観',
        theme: 'テーマ',
        themeSystem: 'システム',
        themeLight: 'ライト',
        themeDark: 'ダーク',
        interfaceSize: 'インターフェイスサイズ',
        fontFamily: 'フォント',
        fontSystem: 'システム',
        chatDensity: 'チャット密度',
        messageStyle: 'メッセージスタイル',
        composerSize: '入力欄サイズ',
        sidebarWidth: 'サイドバー幅',
        codeTheme: 'コードテーマ',
        motion: 'モーション',
        reduceMotion: 'モーションを減らす',
        pointerCursors: '操作部品でポインターカーソル'
      }
    }
  },
  ko: {
    toolbar: { settings: '설정' },
    settings: {
      nav: { general: '일반', appearance: '모양', shortcuts: '키보드 단축키' },
      general: {
        title: '일반',
        workMode: '작업 모드',
        displayName: '표시 이름',
        language: '언어',
        systemLanguage: '시스템 언어',
        sendMessages: '메시지 보내기',
        defaultRuntime: '기본 터미널',
        sidebar: '사이드바',
        runtimeBehavior: '실행 동작',
        preventSleep: '실행 중 잠자기 방지',
        projectlessChat: '기본으로 프로젝트 없는 채팅',
        suggestedPrompts: '추천 프롬프트',
        speed: '속도',
        notifications: '알림',
        notifyUnfocused: '포커스가 없을 때만',
        notifyAlways: '항상',
        notifyNever: '안 함',
        permissionNotifications: '권한 알림 켜기'
      },
      appearance: {
        title: '모양',
        theme: '테마',
        themeSystem: '시스템',
        themeLight: '라이트',
        themeDark: '다크',
        interfaceSize: '인터페이스 크기',
        fontFamily: '글꼴',
        fontSystem: '시스템',
        chatDensity: '채팅 밀도',
        messageStyle: '메시지 스타일',
        composerSize: '작성창 크기',
        sidebarWidth: '사이드바 너비',
        codeTheme: '코드 테마',
        motion: '모션',
        reduceMotion: '모션 줄이기',
        pointerCursors: '컨트롤에 포인터 커서'
      }
    }
  },
  zh: {
    toolbar: { settings: '设置' },
    settings: {
      nav: { general: '通用', appearance: '外观', shortcuts: '键盘快捷键' },
      general: {
        title: '通用',
        workMode: '工作模式',
        displayName: '显示名称',
        language: '语言',
        systemLanguage: '系统语言',
        sendMessages: '发送消息',
        defaultRuntime: '默认终端',
        sidebar: '侧边栏',
        runtimeBehavior: '运行行为',
        preventSleep: '运行时防止睡眠',
        projectlessChat: '默认使用无项目聊天',
        suggestedPrompts: '建议提示',
        speed: '速度',
        notifications: '通知',
        notifyUnfocused: '仅失焦时',
        notifyAlways: '始终',
        notifyNever: '从不',
        permissionNotifications: '启用权限通知'
      },
      appearance: {
        title: '外观',
        theme: '主题',
        themeSystem: '系统',
        themeLight: '浅色',
        themeDark: '深色',
        interfaceSize: '界面大小',
        fontFamily: '字体',
        fontSystem: '系统',
        chatDensity: '聊天密度',
        messageStyle: '消息样式',
        composerSize: '输入框大小',
        sidebarWidth: '侧边栏宽度',
        codeTheme: '代码主题',
        motion: '动效',
        reduceMotion: '减少动效',
        pointerCursors: '控件使用指针光标'
      }
    }
  },
  ar: {
    toolbar: { settings: 'الإعدادات' },
    settings: {
      nav: { general: 'عام', appearance: 'المظهر', shortcuts: 'اختصارات لوحة المفاتيح' },
      general: {
        title: 'عام',
        workMode: 'وضع العمل',
        displayName: 'اسم العرض',
        language: 'اللغة',
        systemLanguage: 'لغة النظام',
        sendMessages: 'إرسال الرسائل',
        defaultRuntime: 'الطرفية الافتراضية',
        sidebar: 'الشريط الجانبي',
        runtimeBehavior: 'سلوك التشغيل',
        preventSleep: 'منع السكون أثناء التشغيل',
        projectlessChat: 'استخدام محادثة بلا مشروع افتراضيا',
        suggestedPrompts: 'اقتراحات',
        speed: 'السرعة',
        notifications: 'الإشعارات',
        notifyUnfocused: 'عند عدم التركيز فقط',
        notifyAlways: 'دائما',
        notifyNever: 'أبدا',
        permissionNotifications: 'تفعيل إشعارات الأذونات'
      },
      appearance: {
        title: 'المظهر',
        theme: 'السمة',
        themeSystem: 'النظام',
        themeLight: 'فاتح',
        themeDark: 'داكن',
        interfaceSize: 'حجم الواجهة',
        fontFamily: 'الخط',
        fontSystem: 'النظام',
        chatDensity: 'كثافة المحادثة',
        messageStyle: 'نمط الرسائل',
        composerSize: 'حجم محرر الرسائل',
        sidebarWidth: 'عرض الشريط الجانبي',
        codeTheme: 'سمة الكود',
        motion: 'الحركة',
        reduceMotion: 'تقليل الحركة',
        pointerCursors: 'مؤشر اليد على عناصر التحكم'
      }
    }
  },
  hi: {
    toolbar: { settings: 'सेटिंग्स' },
    settings: {
      nav: { general: 'सामान्य', appearance: 'दिखावट', shortcuts: 'कीबोर्ड शॉर्टकट' },
      general: {
        title: 'सामान्य',
        workMode: 'कार्य मोड',
        displayName: 'दिखाया जाने वाला नाम',
        language: 'भाषा',
        systemLanguage: 'सिस्टम भाषा',
        sendMessages: 'संदेश भेजें',
        defaultRuntime: 'डिफ़ॉल्ट टर्मिनल',
        sidebar: 'साइडबार',
        runtimeBehavior: 'रनटाइम व्यवहार',
        preventSleep: 'चलते समय स्लीप रोकें',
        projectlessChat: 'डिफ़ॉल्ट रूप से बिना प्रोजेक्ट चैट',
        suggestedPrompts: 'सुझाए गए प्रॉम्प्ट',
        speed: 'गति',
        notifications: 'सूचनाएं',
        notifyUnfocused: 'केवल फोकस न होने पर',
        notifyAlways: 'हमेशा',
        notifyNever: 'कभी नहीं',
        permissionNotifications: 'अनुमति सूचनाएं चालू करें'
      },
      appearance: {
        title: 'दिखावट',
        theme: 'थीम',
        themeSystem: 'सिस्टम',
        themeLight: 'लाइट',
        themeDark: 'डार्क',
        interfaceSize: 'इंटरफ़ेस आकार',
        fontFamily: 'फ़ॉन्ट',
        fontSystem: 'सिस्टम',
        chatDensity: 'चैट घनत्व',
        messageStyle: 'संदेश शैली',
        composerSize: 'कंपोज़र आकार',
        sidebarWidth: 'साइडबार चौड़ाई',
        codeTheme: 'कोड थीम',
        motion: 'मोशन',
        reduceMotion: 'मोशन कम करें',
        pointerCursors: 'कंट्रोल पर पॉइंटर कर्सर'
      }
    }
  }
}

function isObject(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = result[key]
    result[key] = isObject(current) && isObject(value) ? mergeMessages(current, value) : value
  }
  return result
}

const MESSAGES: Record<string, Messages> = Object.fromEntries(
  Object.entries({ en: {}, ...PARTIAL_MESSAGES }).map(([locale, messages]) => [
    locale,
    mergeMessages(EN, messages)
  ])
)

function localeFromSetting(language: LanguageId): string {
  const configured = languageById(language).locale
  if (configured) return configured
  return navigator.language || 'en-US'
}

function messageKeyForLocale(locale: string): keyof typeof MESSAGES {
  const base = locale.toLowerCase().split('-')[0]
  return base in MESSAGES ? base : 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { settings } = useSettings()
  const locale = localeFromSetting(settings.language)
  const messageKey = messageKeyForLocale(locale)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = messageKey === 'ar' ? 'rtl' : 'ltr'
  }, [locale, messageKey])

  return (
    <IntlProvider
      locale={locale}
      messages={MESSAGES[messageKey]}
      onError={() => {
        /* Missing translations fall back to their key below. */
      }}
      getMessageFallback={({ key }) => key}
    >
      {children}
    </IntlProvider>
  )
}
