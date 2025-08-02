let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Previene que el navegador muestre el prompt automático
  e.preventDefault();
  // Guarda el evento para que pueda ser activado más tarde
  deferredPrompt = e;
  
  // Muestra un botón de instalación personalizado
  const installButton = document.createElement('button');
  installButton.id = 'install-button';
  installButton.textContent = 'Instalar App';
  installButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
  `;
  
  document.body.appendChild(installButton);
  
  installButton.addEventListener('click', () => {
    // Oculta nuestro botón de instalación
    installButton.style.display = 'none';
    // Muestra el prompt de instalación
    deferredPrompt.prompt();
    // Espera a que el usuario responda al prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('Usuario aceptó la instalación');
      } else {
        console.log('Usuario rechazó la instalación');
      }
      deferredPrompt = null;
    });
  });
});

window.addEventListener('appinstalled', (evt) => {
  console.log('Aplicación instalada correctamente');
  // Elimina el botón de instalación si existe
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.remove();
  }
});