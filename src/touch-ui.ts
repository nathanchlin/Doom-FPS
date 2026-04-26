import { CONFIG } from './config';

export interface TouchUIElements {
  container: HTMLDivElement;
  leftZone: HTMLDivElement;
  rightZone: HTMLDivElement;
  joystickBase: HTMLDivElement;
  joystickThumb: HTMLDivElement;
  btnReload: HTMLDivElement;
  btnInteract: HTMLDivElement;
  btnWeapon1: HTMLDivElement;
  btnWeapon2: HTMLDivElement;
  btnWeapon3: HTMLDivElement;
}

export function createTouchUI(): TouchUIElements {
  const bs = CONFIG.touch.buttonSize;

  // Main container
  const container = document.createElement('div');
  container.id = 'touch-ui';

  // Left zone (movement)
  const leftZone = document.createElement('div');
  leftZone.id = 'touch-left';

  // Right zone (aim + fire)
  const rightZone = document.createElement('div');
  rightZone.id = 'touch-right';

  // Dynamic joystick elements (hidden until touch)
  const joystickBase = document.createElement('div');
  joystickBase.id = 'joystick-base';
  joystickBase.style.display = 'none';

  const joystickThumb = document.createElement('div');
  joystickThumb.id = 'joystick-thumb';
  joystickBase.appendChild(joystickThumb);

  // Reload button
  const btnReload = createButton('R', 'reload', bs);
  btnReload.style.position = 'absolute';
  btnReload.style.bottom = '155px';
  btnReload.style.left = '20px';

  // Interact button
  const btnInteract = createButton('E', 'interact', bs);
  btnInteract.style.position = 'absolute';
  btnInteract.style.bottom = '215px';
  btnInteract.style.left = '30px';

  // Weapon switch buttons (bottom center row)
  const weaponRow = document.createElement('div');
  weaponRow.id = 'touch-weapon-row';

  const btnWeapon1 = createButton('1', 'weapon-1', 38);
  btnWeapon1.classList.add('weapon-active');
  const btnWeapon2 = createButton('2', 'weapon-2', 38);
  const btnWeapon3 = createButton('3', 'weapon-3', 38);

  weaponRow.appendChild(btnWeapon1);
  weaponRow.appendChild(btnWeapon2);
  weaponRow.appendChild(btnWeapon3);

  // Assemble
  container.appendChild(leftZone);
  container.appendChild(rightZone);
  container.appendChild(joystickBase);
  container.appendChild(btnReload);
  container.appendChild(btnInteract);
  container.appendChild(weaponRow);
  document.body.appendChild(container);

  return {
    container,
    leftZone,
    rightZone,
    joystickBase,
    joystickThumb,
    btnReload,
    btnInteract,
    btnWeapon1,
    btnWeapon2,
    btnWeapon3,
  };
}

function createButton(label: string, action: string, size: number): HTMLDivElement {
  const btn = document.createElement('div');
  btn.className = 'touch-btn';
  btn.dataset.action = action;
  btn.textContent = label;
  btn.style.width = `${size}px`;
  btn.style.height = `${size}px`;
  return btn;
}
