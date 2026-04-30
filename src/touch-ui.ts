import { CONFIG } from './config';

export interface TouchUIElements {
  container: HTMLDivElement;
  leftZone: HTMLDivElement;
  rightZone: HTMLDivElement;
  joystickBase: HTMLDivElement;
  joystickThumb: HTMLDivElement;
  btnFire: HTMLDivElement;
  btnFireLeft: HTMLDivElement;
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

  // Right zone (aim)
  const rightZone = document.createElement('div');
  rightZone.id = 'touch-right';

  // Fire button (right side, vertical center)
  const btnFire = createButton('FIRE', 'fire', 64);
  btnFire.style.position = 'absolute';
  btnFire.style.top = '50%';
  btnFire.style.transform = 'translateY(-50%)';
  btnFire.style.right = '12px';

  // Fire button (left side, vertical center)
  const btnFireLeft = createButton('FIRE', 'fire', 64);
  btnFireLeft.style.position = 'absolute';
  btnFireLeft.style.top = '50%';
  btnFireLeft.style.transform = 'translateY(-50%)';
  btnFireLeft.style.left = '12px';

  // Dynamic joystick elements (hidden until touch)
  const joystickBase = document.createElement('div');
  joystickBase.id = 'joystick-base';
  joystickBase.style.display = 'none';

  const joystickThumb = document.createElement('div');
  joystickThumb.id = 'joystick-thumb';
  joystickBase.appendChild(joystickThumb);

  // Reload button (left top)
  const btnReload = createButton('R', 'reload', bs);
  btnReload.style.position = 'absolute';
  btnReload.style.top = '12px';
  btnReload.style.left = '62px';

  // Interact button (left top)
  const btnInteract = createButton('E', 'interact', bs);
  btnInteract.style.position = 'absolute';
  btnInteract.style.top = '12px';
  btnInteract.style.left = '12px';

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
  container.appendChild(btnFire);
  container.appendChild(btnFireLeft);
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
    btnFire,
    btnFireLeft,
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
