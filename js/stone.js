/*
* Curling Game - A curling simulation game
* Copyright (C) 2025 Barosaurus Software
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
export const StoneColor = Object.freeze({
  RED: 'red',
  YELLOW: 'yellow'
});

export class CurlingStone {
  constructor({
    position = { x: 0, y: 0 },
    velocity = { vx: 0, vy: 0 },
    rotationRadiansPerSecond = 0,
    angleRadians = 0,
    color = StoneColor.RED
  } = {}) {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.rotationRate = rotationRadiansPerSecond;
    this.angle = angleRadians;
    this.color = color;
    this.hasStoppedNotified = false;
    this.pathSamples = [{ ...this.position }];
    this.pathSampleTimer = 0;
  }
}
