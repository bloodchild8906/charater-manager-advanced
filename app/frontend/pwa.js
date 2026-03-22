let deferredInstallPrompt = null;

export function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function canRegisterServiceWorker() {
  return 'serviceWorker' in navigator && ['http:', 'https:'].includes(window.location.protocol);
}

export function initializePwa(onStateChange = () => {}) {
  const publishState = () => {
    onStateChange({
      canInstall: Boolean(deferredInstallPrompt),
      installed: isStandalonePwa(),
    });
  };

  if (canRegisterServiceWorker()) {
    window.addEventListener(
      'load',
      () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      },
      { once: true }
    );
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    publishState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    publishState();
  });

  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  if (typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', publishState);
  }

  publishState();
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    return false;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  try {
    await promptEvent.userChoice;
  } catch {
    return false;
  }
  return true;
}
