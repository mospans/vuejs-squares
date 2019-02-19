class FieldCell {
  constructor(x, y, color, clicked = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.clicked = clicked;
    this.animation = {
      enabled: false,
      tick: 0,
      properties: {},
    };
  }

  onClick(newColor) {
    if (this.clicked === true) {
      return;
    }
    this.clicked = true;
    this.color = newColor;
  }

  stopAnimate() {
    this.animation.properties = {};
    this.animation.tick = 0;
    this.animation.enabled = false;
  }
}

export default FieldCell;
