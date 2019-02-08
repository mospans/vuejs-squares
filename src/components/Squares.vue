<template>
  <div class="squares-game">
    <button v-for="(variant, index) in game.variants" :key="index"
            class="starter"
            @click="startGame(variant.width, variant.height)">
      {{ variant.width }}x{{ variant.height }}
    </button>

    <div class="points">
      Points: {{ game.points }}
    </div>

    <div class="game" :style="{
        height: (height * cellSide) + 'px',
        width: (width * cellSide) + 'px'
    }">
      <div v-for="(cell, index) in cells"
           :key="index"
           class="field-cell"
           v-if="game.status !== game.statuses.GAME_OVER"
           @click="fieldCellOnClick(cell)"
           :class="{clicked: cell.clicked, animated: cell.animation.enabled}"
           :style="getFieldCellStyle(cell)"
           :ref="'cell' + index"
      ></div>

      <div class="game_over"
           v-if="game.status === game.statuses.GAME_OVER"
           :style="{
             top: (height * cellSide / 2) + 'px'
           }"
      >
        Game over
      </div>
    </div>
  </div>
</template>

<script>
import _ from 'lodash/lodash';
import FieldCell from './FieldCell';

const colors = ['#000', '#44f', '#f44', '#4f4', '#b0b', '#ff4'];

const colorsCount = colors.length - 1;

const minCountFieldCellsInRow = 3;

let disappearingFieldCellsIndexes = [];
let animationPromises = [];

const randomFromTo = function (fromValue, toValue) {
  return Math.floor(Math.random() * (toValue - fromValue + 1)) + fromValue;
};

const generateRandomColor = function (excludedValues) {
  if (excludedValues === null || excludedValues === undefined) {
    excludedValues = [];
  }
  let result;
  do {
    result = randomFromTo(1, colorsCount);
  } while (excludedValues.indexOf(result) !== -1);

  return result;
};

const getNextAnimationValues = function (animation) {
  const result = {};

  _.forEach(animation.properties, (range, property) => {
    result[property] = range.start + animation.tick * (range.end - range.start) / 24;
    if (
      (result[property] > range.end && range.start < range.end)
      || (result[property] < range.end && range.start > range.end)
    ) {
      delete result[property];
      return;
    }

    result[property] = modifyCssValueByProperty(property, result[property]);
  });

  return result;
};

const setCss = function (element, style) {
  _.forEach(style, (value, property) => {
    element.style[property] = value;
  });
};

let modifyCssValueByProperty = function (property, value) {
  switch (property) {
    case 'left':
    case 'top':
      value += 'px';
      break;
  }

  return value.toString();
};

const stopAnimate = function (fieldCell) {
  fieldCell.animation.properties = {};
  fieldCell.animation.tick = 0;
  fieldCell.animation.enabled = false;
};

export default {
  name: 'squares',

  data() {
    return {
      width: 3,
      height: 3,
      cells: [],
      cellSide: 50,
      game: {
        variants: [
          { width: 3, height: 3 },
          { width: 5, height: 5 },
          { width: 7, height: 7 },
          { width: 9, height: 9 },
          { width: 10, height: 10 },
          { width: 12, height: 12 },
        ],
        points: 0,
        statuses: {
          STOPPED: 1,
          RAN: 2,
          ANIMATION_CELLS_DISAPPEARING: 3,
          ANIMATION_SHIFT: 4,
          ANIMATION_GAME_OVER: 5,
          GAME_OVER: 6,
        },
        status: undefined,
      },
    };
  },

  methods: {
    startGame(width, height) {
      this.width = width;
      this.height = height;
      let wideSideSize = width;
      if (this.height > this.width) {
        wideSideSize = height;
      }
      this.cellSide = Math.round(500 / wideSideSize);
      this.game.points = 0;
      disappearingFieldCellsIndexes = [];

      this.fill();
      this.game.status = this.game.statuses.RAN;
    },

    /**
     * @param {FieldCell} cell
     * @returns {{width: string, height: string, backgroundColor: string}}
     */
    getFieldCellStyle(cell) {
      return {
        width: `${this.cellSide - 2}px`,
        height: `${this.cellSide - 2}px`,
        backgroundColor: colors[cell.color],
      };
    },

    fieldCellOnClick(cell) {
      if (this.isAnimate() === true) {
        return;
      }

      cell.onClick(generateRandomColor([cell.color]));
      if (this.disappearByFieldCell(cell) === true) {
        this.game.status = this.game.statuses.ANIMATION_CELLS_DISAPPEARING;
      } else {
        this.checkGameOver();
      }
    },
  },

  watch: {
    'game.status': function (newValue, oldValue) {
      const that = this;
      animationPromises = [];

      switch (newValue) {
        case that.game.statuses.RAN:
          if (oldValue !== that.game.statuses.STOPPED) {
            that.$nextTick(() => {
              that.disappearAll();
            });
          }
          break;

        case that.game.statuses.ANIMATION_CELLS_DISAPPEARING:
          that.fieldCellsCoordinatesForEach((x, y) => {
            if (that.isFieldCellProcessed(x, y) === false) {
              return undefined;
            }
            const fieldCell = that.getFieldCell(x, y);
            fieldCell.animation.properties.opacity = {};
            fieldCell.animation.properties.opacity.start = 1;
            fieldCell.animation.properties.opacity.end = 0;
            fieldCell.animation.enabled = true;
            that.fieldCellAnimate(x, y);
          });
          break;

        case that.game.statuses.ANIMATION_SHIFT:
          let changedPartOfColumn;

          let fieldCell;

          let countNewFieldCells = 0;

          let startDelta;

          let fromNewToOldYValue;
          for (let x = 0; x < that.width; x++) {
            changedPartOfColumn = [];
            fromNewToOldYValue = {};
            for (let y = 0; y < that.height; y++) {
              if (that.isFieldCellProcessed(x, y) === true) {
                changedPartOfColumn.push(new FieldCell(
                  x,
                  changedPartOfColumn.length,
                  generateRandomColor(),
                  false,
                ));
              }
            }
            countNewFieldCells = changedPartOfColumn.length;
            for (let y = 0; y < that.height; y++) {
              if (that.isFieldCellProcessed(x, y) === false) {
                if (changedPartOfColumn.length === y) {
                  break;
                }
                fieldCell = that.getFieldCell(x, y);
                fromNewToOldYValue[changedPartOfColumn.length] = y;
                changedPartOfColumn.push(new FieldCell(
                  x,
                  changedPartOfColumn.length,
                  fieldCell.color,
                  fieldCell.clicked,
                ));
              }
            }
            for (const newY in changedPartOfColumn) {
              if (newY <= countNewFieldCells) {
                startDelta = +newY - countNewFieldCells;
              } else {
                startDelta = fromNewToOldYValue[newY];
              }
              fieldCell = that.getFieldCell(x, +newY);
              fieldCell.color = changedPartOfColumn[newY].color;
              fieldCell.clicked = changedPartOfColumn[newY].clicked;
              fieldCell.animation.properties.top = {};
              fieldCell.animation.properties.top.start = startDelta * that.cellSide;
              fieldCell.animation.properties.top.end = changedPartOfColumn[newY].y * that.cellSide;
              fieldCell.animation.enabled = true;
              that.fieldCellAnimate(x, +newY);
              setCss(that.getElement(x, +newY), { opacity: 1 });
            }
          }
          disappearingFieldCellsIndexes = [];
          break;

        case that.game.statuses.ANIMATION_GAME_OVER:
          that.fieldCellsCoordinatesForEach((x, y) => {
            const fieldCell = that.getFieldCell(x, y);
            fieldCell.animation.properties.left = {};
            fieldCell.animation.properties.left.start = x * that.cellSide;
            fieldCell.animation.properties.top = {};
            fieldCell.animation.properties.top.start = y * that.cellSide;

            // 50% - 50%
            if (randomFromTo(1, 2) === 1) {
              fieldCell.animation.properties.top.end = randomFromTo(
                -that.cellSide - 200,
                -that.cellSide,
              );
            } else {
              fieldCell.animation.properties.top.end = randomFromTo(
                that.cellSide * that.width,
                that.cellSide * that.width + 200,
              );
            }
            // 50% - 50%
            if (randomFromTo(1, 2) === 1) {
              fieldCell.animation.properties.left.end = randomFromTo(
                -that.cellSide - 200,
                -that.cellSide,
              );
            } else {
              fieldCell.animation.properties.left.end = randomFromTo(
                that.cellSide * that.height,
                that.cellSide * that.height + 200,
              );
            }

            fieldCell.animation.properties.opacity = {};
            fieldCell.animation.properties.opacity.start = 1;
            fieldCell.animation.properties.opacity.end = 0;
            fieldCell.animation.enabled = true;
            that.fieldCellAnimate(x, y);
          });
          break;
      }

      Promise.all(animationPromises)
        .then(() => {
          if (animationPromises.length === 0) {
            return Promise.resolve();
          }

          animationPromises = [];

          that.$nextTick(() => {
            that.changeStatusAfterAnimation();
          });
        });
    },
  },

  created() {
    this.getFieldCellIndex = function (x, y) {
      return y * this.width + x;
    };

    /**
     * @param {number} x
     * @param {number} y
     * @returns FieldCell
     */
    this.getFieldCell = function (x, y) {
      const cellIndex = this.getFieldCellIndex(x, y);
      if (this.cells.length < cellIndex) {
        throw new Error(`Not found cell with coordinates ${x.toString()}, ${y.toString()}`);
      }
      return this.cells[cellIndex];
    };

    this.getElement = function (x, y) {
      return this.$refs[`cell${this.getFieldCellIndex(x, y)}`][0];
    };

    this.positionElement = function (x, y) {
      const style = {
        left: `${x * this.cellSide}px`,
        top: `${y * this.cellSide}px`,
        opacity: 1,
      };

      const element = this.getElement(x, y);
      setCss(element, style);
    };

    this.fieldCellsCoordinatesForEach = function (callback, atEndReturnValue) {
      if (typeof callback !== 'function') {
        throw new Error('Argument is not a function');
      }

      let result;

      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          result = callback(x, y);
          if (result !== undefined) {
            return result;
          }
        }
      }

      if (atEndReturnValue !== undefined) {
        return atEndReturnValue;
      }
    };

    this.fill = function () {
      const that = this;

      this.cells = [];
      this.fieldCellsCoordinatesForEach((x, y) => {
        let excludedColorIndexes = [];
        if (x === 0 && y === 0) {
          excludedColorIndexes = [];
        } else if (x === 0) {
          excludedColorIndexes.push(
            that.getFieldCell(x, y - 1).color,
          );
        } else if (y === 0) {
          excludedColorIndexes.push(
            that.getFieldCell(x - 1, y).color,
          );
        } else {
          excludedColorIndexes.push(
            that.getFieldCell(x, y - 1).color,
          );
          excludedColorIndexes.push(
            that.getFieldCell(x - 1, y).color,
          );
        }

        that.cells.push(new FieldCell(
          x,
          y,
          generateRandomColor(excludedColorIndexes),
        ));

        that.$nextTick(() => {
          that.positionElement(x, y);
        });
      });
    };

    this.disappearByFieldCell = function (fieldCell) {
      const
        x = fieldCell.x;

      const y = fieldCell.y;

      // iteration of matches colors:

      let iteration = 1;

      // point of match color:

      const matches = {
        top: { x, y },
        right: { x, y },
        bottom: { x, y },
        left: { x, y },
      };

      // in which directions search goes on:

      const activeDirections = {
        top: true,
        right: true,
        bottom: true,
        left: true,
      };

      // count of horizontal matches colors:

      let horizontalMatchesCount = 1;

      // count of vertical matches colors

      let verticalMatchesCount = 1;

      while (iteration < 10) {
        // check top border
        if (matches.top.y === 0) {
          activeDirections.top = false;
        }
        // check right border
        if (matches.right.x === this.width - 1) {
          activeDirections.right = false;
        }
        // check bottom border
        if (matches.bottom.y === this.height - 1) {
          activeDirections.bottom = false;
        }
        // check left border
        if (matches.left.x === 0) {
          activeDirections.left = false;
        }
        if (activeDirections.top === true) {
          if (
            this.getFieldCell(x, matches.top.y - 1).color === fieldCell.color
            && this.isFieldCellProcessed(x, y) === false
          ) {
            matches.top.y = matches.top.y - 1;
            verticalMatchesCount++;
          } else {
            activeDirections.top = false;
          }
        }
        if (activeDirections.right === true) {
          if (
            this.getFieldCell(matches.right.x + 1, y).color === fieldCell.color
            && this.isFieldCellProcessed(x, y) === false
          ) {
            matches.right.x = matches.right.x + 1;
            horizontalMatchesCount++;
          } else {
            activeDirections.right = false;
          }
        }
        if (activeDirections.bottom === true) {
          if (
            this.getFieldCell(x, matches.bottom.y + 1).color === fieldCell.color
            && this.isFieldCellProcessed(x, y) === false
          ) {
            matches.bottom.y = matches.bottom.y + 1;
            verticalMatchesCount++;
          } else {
            activeDirections.bottom = false;
          }
        }
        if (activeDirections.left === true) {
          if (
            this.getFieldCell(matches.left.x - 1, y).color === fieldCell.color
            && this.isFieldCellProcessed(x, y) === false
          ) {
            matches.left.x = matches.left.x - 1;
            horizontalMatchesCount++;
          } else {
            activeDirections.left = false;
          }
        }

        if (_.isEqual(activeDirections, {
          top: false, right: false, bottom: false, left: false,
        })) {
          break;
        }
        iteration++;
      }
      if (verticalMatchesCount < minCountFieldCellsInRow && horizontalMatchesCount < minCountFieldCellsInRow) {
        return false;
      }
      if (verticalMatchesCount >= minCountFieldCellsInRow) {
        for (let checkingY = matches.top.y; checkingY <= matches.bottom.y; checkingY++) {
          if (this.isFieldCellProcessed(x, checkingY) === true) {
            continue;
          }
          if (this.getFieldCell(x, checkingY).clicked === true) {
            this.game.points++;
            this.getFieldCell(x, checkingY).clicked = false;
          }
          this.game.points++;
          disappearingFieldCellsIndexes.push(this.getFieldCellIndex(x, checkingY));
        }
      }
      if (horizontalMatchesCount >= minCountFieldCellsInRow) {
        for (let checkingX = matches.left.x; checkingX <= matches.right.x; checkingX++) {
          if (this.isFieldCellProcessed(checkingX, y) === true) {
            continue;
          }
          if (this.getFieldCell(checkingX, y).clicked === true) {
            this.game.points++;
            this.getFieldCell(checkingX, y).clicked = false;
          }
          this.game.points++;
          disappearingFieldCellsIndexes.push(this.getFieldCellIndex(checkingX, y));
        }
      }
      return true;
    };

    this.isFieldCellProcessed = function (x, y) {
      return (disappearingFieldCellsIndexes.indexOf(this.getFieldCellIndex(x, y)) !== -1);
    };

    this.checkGameOver = function () {
      const that = this;

      const isGameOver = this.fieldCellsCoordinatesForEach(
        (x, y) => {
          if (that.getFieldCell(x, y).clicked === false) {
            return false;
          }
        },
        true,
      );

      if (isGameOver === true) {
        this.game.status = this.game.statuses.ANIMATION_GAME_OVER;
      }
    };

    this.disappearAll = function () {
      let needToRestart = false;

      let fieldCell;

      let needToAnimateDisappearingCells = false;
      do {
        needToRestart = false;
        for (const cellIndex in this.cells) {
          fieldCell = this.cells[cellIndex];
          if (this.disappearByFieldCell(fieldCell) === true) {
            needToRestart = true;
            needToAnimateDisappearingCells = true;
            break;
          }
        }
      } while (needToRestart === true);

      if (needToAnimateDisappearingCells === true) {
        this.game.status = this.game.statuses.ANIMATION_CELLS_DISAPPEARING;
      } else {
        this.checkGameOver();
      }
    };

    this.isAnimate = function () {
      return this.isStatusAnimation(this.game.status);
    };

    this.isStatusAnimation = function (status) {
      let isAnimate = false;
      _.forEach(this.game.statuses, (value, property) => {
        if (status === value && property.substr(0, 10) === 'ANIMATION_') {
          isAnimate = true;
        }
      });

      return isAnimate;
    };

    /**
     * @param {number} x
     * @param {number} y
     */
    this.fieldCellAnimate = function (x, y) {
      const that = this;

      animationPromises.push(new Promise(((resolve) => {
        that.animateStep(x, y, resolve);
      })));
    };

    this.animateStep = function (x, y, resolve) {
      const that = this;

      const element = this.getElement(x, y);

      const fieldCell = this.getFieldCell(x, y);

      let changedStyle = {};

      if (
        fieldCell.animation.enabled === true
        && _.isEqual(fieldCell.animation.properties, {}) === false
      ) {
        fieldCell.animation.tick++;
        changedStyle = getNextAnimationValues(fieldCell.animation);
        setCss(element, changedStyle);
      }

      if (
        fieldCell.animation.enabled === false
        || _.isEqual(changedStyle, {}) === true
      ) {
        stopAnimate(fieldCell);
        resolve();
      } else {
        window.requestAnimationFrame(() => {
          that.animateStep(x, y, resolve);
        });
      }
    };

    this.changeStatusAfterAnimation = function () {
      switch (this.game.status) {
        case this.game.statuses.ANIMATION_GAME_OVER:
          this.game.status = this.game.statuses.GAME_OVER;
          break;

        case this.game.statuses.ANIMATION_CELLS_DISAPPEARING:
          this.game.status = this.game.statuses.ANIMATION_SHIFT;
          break;

        case this.game.statuses.ANIMATION_SHIFT:
          this.game.status = this.game.statuses.RAN;
          break;
      }
    };
  },
};
</script>

<style scoped>
  .squares-game {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    position: relative;
    width: 500px;
    height: 100%;
    margin: 0 auto;
    text-align: center;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 20px;
  }

  .starter {
    margin-right: 5px;
    font-size: inherit;
  }

  .points {
    margin: 10px 0;
    font-size: inherit;
  }

  .game {
    position: relative;
    margin: 0 auto;
    overflow: hidden;
  }

  .game_over {
    position: absolute;
    left: 0;
    right: 0;
    margin-top: -0.5em;
    text-align: center;
  }

  .field-cell {
    position: absolute;
    z-index: 1;
    background-repeat: no-repeat;
    background-position: center center;
    border: none;
    -webkit-border-radius: 4px;
    -moz-border-radius: 4px;
    border-radius: 4px;
  }

  .field-cell:not(.clicked) {
    cursor: pointer;
    background-image: none;
  }

  .field-cell.clicked {
    cursor: default;
    background-image: url('../assets/cross.png');
  }
</style>
