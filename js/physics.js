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
import { CurlingStone, StoneColor } from './stone.js';

const SPEED_EPSILON = 0.01;
const TWO_PI = Math.PI * 2;
const FOOT_IN_METERS = 0.3048;
const DEFAULT_FRICTION_BASELINE = 0.0164;
const DEFAULT_FRICTION_SPEED_FACTOR = 0.1732;
const DEFAULT_FRICTION_LOW_SPEED_EPS = 1.0;
const DEFAULT_CURL_MIN_SPEED = 0.15;
const DEFAULT_CURL_ROTATION_REFERENCE = 6.0;
const DEFAULT_CURL_ASYMMETRY = 0.008;
const DEFAULT_CURL_VELOCITY_BIAS = 0.5;
const DEFAULT_CURL_MIN_OMEGA = 0.05;
const GRAVITY = 9.81;
const DEFAULT_COLLISION_RESTITUTION = 0.9;
const DEFAULT_COLLISION_SPIN_TRANSFER = 0.3;
const DEFAULT_COLLISION_SPIN_DAMPING = 0.001;
const DEFAULT_COLLISION_TANGENTIAL_LOSS = 0.1;
const COLLISION_EPSILON = 1e-4;
const DEFAULT_PATH_SAMPLE_INTERVAL = 1.0;
const MAX_PATH_SAMPLE_POINTS = 240;

export class PhysicsEngine {
  constructor({
    frictionBaseline = DEFAULT_FRICTION_BASELINE,
    frictionSpeedFactor = DEFAULT_FRICTION_SPEED_FACTOR,
    frictionLowSpeedEps = DEFAULT_FRICTION_LOW_SPEED_EPS,
    curlMinSpeed = DEFAULT_CURL_MIN_SPEED,
    curlRotationReference = DEFAULT_CURL_ROTATION_REFERENCE,
    curlAsymmetry = DEFAULT_CURL_ASYMMETRY,
    curlVelocityBias = DEFAULT_CURL_VELOCITY_BIAS,
    curlMinOmega = DEFAULT_CURL_MIN_OMEGA,
    collisionRestitution = DEFAULT_COLLISION_RESTITUTION,
    collisionSpinTransfer = DEFAULT_COLLISION_SPIN_TRANSFER,
    collisionSpinDamping = DEFAULT_COLLISION_SPIN_DAMPING,
    collisionTangentialLoss = DEFAULT_COLLISION_TANGENTIAL_LOSS,
    launchY,
    stoneRadius,
    hogLineNear,
    hogLineFar,
    sheetExtents,
    backLineY,
    onStoneStopped,
    onHogSplit,
    onHogNearCross,
    onStoneReleased
  }) {
    this.frictionBaseline = frictionBaseline;
    this.frictionSpeedFactor = frictionSpeedFactor;
    this.frictionLowSpeedEps = frictionLowSpeedEps;
    this.curlMinSpeed = curlMinSpeed;
    this.curlRotationReference = curlRotationReference;
    this.curlAsymmetry = curlAsymmetry;
    this.curlVelocityBias = curlVelocityBias;
    this.curlMinOmega = curlMinOmega;
    this.collisionRestitution = collisionRestitution;
    this.collisionSpinTransfer = collisionSpinTransfer;
    this.collisionSpinDamping = collisionSpinDamping;
    this.collisionTangentialLoss = collisionTangentialLoss;
    this.pathSampleInterval = DEFAULT_PATH_SAMPLE_INTERVAL;
    this.maxPathSamples = MAX_PATH_SAMPLE_POINTS;
    this.launchY = launchY;
    this.stoneRadius = stoneRadius;
    this.hogLineNear = hogLineNear;
    this.hogLineFar = hogLineFar;
    this.sheetExtents = sheetExtents;
    this.backLineY = backLineY;
    this.stones = [];
    this.stoneInventory = new Map();
    this.outTrayLayouts = new Map();
    this.outTrayIndices = new Map();
    this.isActive = false;
    this.lastTimestamp = null;
    this.onStoneStopped = onStoneStopped;
    this.onHogSplit = onHogSplit;
    this.onHogNearCross = onHogNearCross;
    this.onStoneReleased = onStoneReleased;
  }

  initializeStones(stoneConfigs = []) {
    this.stoneInventory.clear();
    this.stones = [];
    this.isActive = false;
    this.lastTimestamp = null;

    for (const config of stoneConfigs) {
      const stone = new CurlingStone({
        position: config.position ?? { x: 0, y: 0 },
        velocity: { vx: 0, vy: 0 },
        rotationRadiansPerSecond: 0,
        angleRadians: 0,
        color: config.color ?? StoneColor.RED
      });
      stone.number = config.number ?? 0;
      stone.isLaunched = false;
      stone.isOut = false;
      stone.pendingRotationRate = 0;
      stone.rotationRate = 0;
      stone.rotationActivated = false;
      stone.hasStoppedNotified = true;
      this.resetStonePath(stone);
      this.attachTiming(stone);
      const key = this.makeStoneKey(stone.color, stone.number);
      this.stoneInventory.set(key, stone);
      this.stones.push(stone);
    }
  }

  setOutTrayLayouts(layoutMap = {}) {
    this.outTrayLayouts.clear();
    this.outTrayIndices.clear();
    for (const [color, slots] of Object.entries(layoutMap)) {
      this.outTrayLayouts.set(color, Array.isArray(slots) ? slots : []);
      this.outTrayIndices.set(color, 0);
    }
  }

  throwStone({
    color,
    number,
    velocity,
    rotationRadiansPerSecond = 0,
    angleRadians = 0,
    offsetX = 0
  }) {
    if (!velocity) {
      throw new Error('Velocity is required to throw a stone.');
    }

    if (!color || number == null) {
      throw new Error('Color and stone number are required to throw a stone.');
    }

    const stone = this.findStone(color, number);
    if (!stone) {
      throw new Error(`Stone ${color ?? 'unknown'} #${number ?? '?'} is not registered.`);
    }

    if (stone.isLaunched) {
      throw new Error(`Stone ${color} #${number} has already been thrown.`);
    }

    stone.position = { x: offsetX, y: this.launchY };
    stone.velocity = { vx: velocity.vx, vy: velocity.vy };
    stone.pendingRotationRate = rotationRadiansPerSecond;
    stone.rotationRate = 0;
    stone.rotationActivated = rotationRadiansPerSecond === 0;
    stone.angle = angleRadians;
    stone.isLaunched = true;
    stone.isOut = false;
    stone.hasStoppedNotified = false;
    this.resetStonePath(stone);
    this.attachTiming(stone);

    if (this.onStoneReleased) {
      this.onStoneReleased(performance.now());
    }
    this.isActive = true;
    this.lastTimestamp = null;
    return stone;
  }

  attachTiming(stone) {
    stone.hogTiming = {
      nearCrossedAt: null,
      farCrossedAt: null
    };
  }

  update(timestamp) {
    if (!this.isActive) {
      this.lastTimestamp = timestamp;
      return;
    }

    if (this.lastTimestamp == null) {
      this.lastTimestamp = timestamp;
      return;
    }

    const deltaSeconds = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    this.step(deltaSeconds);
  }

  step(deltaSeconds) {
    let anyMoving = false;

    const rotationActivationY = (this.hogLineNear ?? 0) - FOOT_IN_METERS * 2;

    for (const stone of this.stones) {
      if (!stone.isLaunched) {
        continue;
      }

      const rotationRate = stone.rotationRate ?? 0;
      stone.angle = (stone.angle ?? 0) + rotationRate * deltaSeconds;
      if (stone.angle >= TWO_PI || stone.angle <= -TWO_PI) {
        stone.angle %= TWO_PI;
      }
      if (stone.angle < 0) {
        stone.angle += TWO_PI;
      }

      const speed = Math.hypot(stone.velocity.vx, stone.velocity.vy);
      const friction =
        this.frictionBaseline + this.frictionSpeedFactor / (speed + this.frictionLowSpeedEps);

      if (rotationRate !== 0) {
        const angularSpeed = Math.abs(rotationRate);
        const rotationFrictionMultiplier = speed <= SPEED_EPSILON ? 1.4 : 0.7;
        const reducedAngularSpeed = Math.max(
          0,
          angularSpeed - rotationFrictionMultiplier * friction * deltaSeconds
        );
        stone.rotationRate =
          reducedAngularSpeed === 0 ? 0 : Math.sign(rotationRate) * reducedAngularSpeed;
      }

      const rotationActive = Math.abs(stone.rotationRate ?? 0) > SPEED_EPSILON;

      if (speed <= SPEED_EPSILON) {
        stone.velocity.vx = 0;
        stone.velocity.vy = 0;
        this.recordStonePathSample(stone, deltaSeconds, 0);
        if (!rotationActive) {
          if (this.isOutBeforeFarHog(stone)) {
            this.handleStoneOut(stone);
            continue;
          }
          if (!stone.hasStoppedNotified && this.onStoneStopped) {
            this.onStoneStopped(stone);
            stone.hasStoppedNotified = true;
          }
        }
        if (rotationActive) {
          anyMoving = true;
          stone.hasStoppedNotified = false;
        }
        continue;
      }

      stone.hasStoppedNotified = false;

      let dirX = stone.velocity.vx / speed;
      let dirY = stone.velocity.vy / speed;
      const speedReduction = friction * deltaSeconds;
      const newSpeed = Math.max(0, speed - speedReduction);

      const avgSpeed = (speed + newSpeed) * 0.5;
      const displacement = avgSpeed * deltaSeconds;

      const headingDelta = this.computeCurlHeadingDelta(stone, speed, displacement, deltaSeconds);
      if (headingDelta !== 0) {
        const cosDelta = Math.cos(headingDelta);
        const sinDelta = Math.sin(headingDelta);
        const rotatedDirX = dirX * cosDelta - dirY * sinDelta;
        const rotatedDirY = dirX * sinDelta + dirY * cosDelta;
        dirX = rotatedDirX;
        dirY = rotatedDirY;
      }

      const previousY = stone.position.y;
      stone.position.x += dirX * displacement;
      stone.position.y += dirY * displacement;
      this.recordStonePathSample(stone, deltaSeconds, displacement);

      stone.velocity.vx = dirX * newSpeed;
      stone.velocity.vy = dirY * newSpeed;
      if (this.isOutOfBounds(stone)) {
        this.handleStoneOut(stone);
        continue;
      }
      this.checkRotationActivation(stone, previousY, rotationActivationY);
      this.checkHogLineCrossings(stone, previousY);

      if (Math.hypot(stone.velocity.vx, stone.velocity.vy) > SPEED_EPSILON) {
        anyMoving = true;
      } else {
        stone.velocity.vx = 0;
        stone.velocity.vy = 0;
        if (!rotationActive) {
          if (this.isOutBeforeFarHog(stone)) {
            this.handleStoneOut(stone);
            continue;
          }
          if (!stone.hasStoppedNotified && this.onStoneStopped) {
            this.onStoneStopped(stone);
            stone.hasStoppedNotified = true;
          }
        }
      }

      if (rotationActive) {
        anyMoving = true;
      }
    }

    if (this.resolveCollisions(deltaSeconds)) {
      anyMoving = true;
    }

    if (!anyMoving) {
      this.isActive = false;
      this.lastTimestamp = null;
    }
  }

  checkRotationActivation(stone, previousY, activationY) {
    if (stone.rotationActivated || !stone.pendingRotationRate) {
      return;
    }

    const currentY = stone.position.y;
    const crossed =
      (previousY < activationY && currentY >= activationY) ||
      (previousY > activationY && currentY <= activationY);

    if (crossed || currentY === activationY) {
      stone.rotationRate = stone.pendingRotationRate;
      stone.pendingRotationRate = 0;
      stone.rotationActivated = true;
    }
  }

  makeStoneKey(color, number) {
    return `${color}:${number}`;
  }

  findStone(color, number) {
    return this.stoneInventory.get(this.makeStoneKey(color, number));
  }

  isOutBeforeFarHog(stone) {
    if (this.hogLineFar == null) {
      return false;
    }
    return stone.position.y < this.hogLineFar;
  }

  isOutOfBounds(stone) {
    if (!this.sheetExtents) {
      return false;
    }

    const leftBound = this.sheetExtents.xMin + this.stoneRadius;
    const rightBound = this.sheetExtents.xMax - this.stoneRadius;
    if (stone.position.x <= leftBound || stone.position.x >= rightBound) {
      return true;
    }

    if (
      this.backLineY != null &&
      stone.position.y - this.stoneRadius >= this.backLineY
    ) {
      return true;
    }

    return false;
  }

  handleStoneOut(stone) {
    stone.velocity.vx = 0;
    stone.velocity.vy = 0;
    stone.pendingRotationRate = 0;
    stone.rotationRate = 0;
    stone.rotationActivated = true;
    stone.angle = 0;
    stone.isLaunched = false;
    stone.isOut = true;
    stone.hasStoppedNotified = true;
    this.placeStoneInOutTray(stone);
    if (this.onStoneStopped) {
      this.onStoneStopped(stone);
    }
  }

  placeStoneInOutTray(stone) {
    const slots = this.outTrayLayouts.get(stone.color);
    if (!slots || slots.length === 0) {
      return;
    }

    const currentIndex = this.outTrayIndices.get(stone.color) ?? 0;
    const slot = slots[Math.min(currentIndex, slots.length - 1)];
    stone.position = { ...slot };
    this.outTrayIndices.set(
      stone.color,
      Math.min(currentIndex + 1, slots.length - 1)
    );
  }

  resetOutTrayIndices() {
    for (const color of this.outTrayIndices.keys()) {
      this.outTrayIndices.set(color, 0);
    }
  }

  getStones() {
    return this.stones;
  }

  isRunning() {
    return this.isActive;
  }

  checkHogLineCrossings(stone, previousY) {
    if (!stone.hogTiming) {
      return;
    }

    const hogNear = this.hogLineNear;
    const hogFar = this.hogLineFar;

    if (
      stone.hogTiming.nearCrossedAt == null &&
      ((previousY < hogNear && stone.position.y >= hogNear) ||
        (previousY > hogNear && stone.position.y <= hogNear))
    ) {
      stone.hogTiming.nearCrossedAt = performance.now();
      if (this.onHogNearCross) {
        this.onHogNearCross();
      }
    }

    if (
      stone.hogTiming.nearCrossedAt != null &&
      stone.hogTiming.farCrossedAt == null &&
      ((previousY < hogFar && stone.position.y >= hogFar) ||
        (previousY > hogFar && stone.position.y <= hogFar))
    ) {
      stone.hogTiming.farCrossedAt = performance.now();
      if (this.onHogSplit) {
        const durationMs = stone.hogTiming.farCrossedAt - stone.hogTiming.nearCrossedAt;
        this.onHogSplit(durationMs);
      }
    }
  }

  resetStonePath(stone, includeCurrentPosition = true) {
    if (includeCurrentPosition) {
      stone.pathSamples = [{ x: stone.position.x, y: stone.position.y }];
    } else {
      stone.pathSamples = [];
    }
    stone.pathSampleTimer = 0;
  }

  recordStonePathSample(stone, deltaSeconds, displacement) {
    if (!stone.pathSamples) {
      this.resetStonePath(stone);
    }

    const moving = displacement > 0 && deltaSeconds > 0;
    if (moving) {
      stone.pathSampleTimer = (stone.pathSampleTimer ?? 0) + deltaSeconds;
      const interval = this.pathSampleInterval ?? DEFAULT_PATH_SAMPLE_INTERVAL;
      while (stone.pathSampleTimer >= interval) {
        stone.pathSamples.push({ x: stone.position.x, y: stone.position.y });
        stone.pathSampleTimer -= interval;
        this.trimPathSamples(stone);
      }
      return;
    }

    this.appendTerminalPathPoint(stone);
  }

  appendTerminalPathPoint(stone) {
    if (!stone.pathSamples || stone.pathSamples.length === 0) {
      this.resetStonePath(stone);
      return;
    }
    const last = stone.pathSamples[stone.pathSamples.length - 1];
    const currentX = stone.position.x;
    const currentY = stone.position.y;
    if (last.x !== currentX || last.y !== currentY) {
      stone.pathSamples.push({ x: currentX, y: currentY });
      this.trimPathSamples(stone);
    }
  }

  trimPathSamples(stone) {
    if (!this.maxPathSamples || !stone.pathSamples) {
      return;
    }
    const excess = stone.pathSamples.length - this.maxPathSamples;
    if (excess > 0) {
      stone.pathSamples.splice(0, excess);
    }
  }

  resolveCollisions(deltaSeconds) {
    const radius = this.stoneRadius ?? 0.145;
    if (!radius) {
      return false;
    }

    const minDistance = radius * 2;
    const restitution = Math.max(
      0,
      Math.min(this.collisionRestitution ?? DEFAULT_COLLISION_RESTITUTION, 1)
    );
    const spinTransfer = Math.max(
      0,
      this.collisionSpinTransfer ?? DEFAULT_COLLISION_SPIN_TRANSFER
    );
    const spinDamping = Math.max(
      0,
      Math.min(this.collisionSpinDamping ?? DEFAULT_COLLISION_SPIN_DAMPING, 0.95)
    );
    const tangentialLoss = Math.max(
      0,
      Math.min(this.collisionTangentialLoss ?? DEFAULT_COLLISION_TANGENTIAL_LOSS, 0.95)
    );

    const rewindStone = (stone, time) => {
      if (!stone || time <= 0) {
        return;
      }
      stone.position.x -= (stone.velocity.vx ?? 0) * time;
      stone.position.y -= (stone.velocity.vy ?? 0) * time;
    };

    const advanceStone = (stone, time) => {
      if (!stone || time <= 0) {
        return;
      }
      stone.position.x += (stone.velocity.vx ?? 0) * time;
      stone.position.y += (stone.velocity.vy ?? 0) * time;
    };

    let generatedMotion = false;
    for (let i = 0; i < this.stones.length; i += 1) {
      const stoneA = this.stones[i];
      if (!stoneA?.isLaunched || stoneA.isOut) {
        continue;
      }
      for (let j = i + 1; j < this.stones.length; j += 1) {
        const stoneB = this.stones[j];
        if (!stoneB?.isLaunched || stoneB.isOut) {
          continue;
        }

        let dx = stoneB.position.x - stoneA.position.x;
        let dy = stoneB.position.y - stoneA.position.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance && distance > 0) {
          continue;
        }

        let normalX = 1;
        let normalY = 0;
        if (distance > COLLISION_EPSILON) {
          normalX = dx / distance;
          normalY = dy / distance;
        }

        const relVelXInitial = (stoneA.velocity.vx ?? 0) - (stoneB.velocity.vx ?? 0);
        const relVelYInitial = (stoneA.velocity.vy ?? 0) - (stoneB.velocity.vy ?? 0);
        let relVelAlongNormal = relVelXInitial * normalX + relVelYInitial * normalY;
        const overlapInitial = Math.max(0, minDistance - distance);

        let rewindTime = 0;
        if (
          overlapInitial > COLLISION_EPSILON &&
          relVelAlongNormal < -SPEED_EPSILON &&
          deltaSeconds &&
          deltaSeconds > SPEED_EPSILON
        ) {
          const penetrationSpeed = -relVelAlongNormal;
          const maxRewind = deltaSeconds;
          rewindTime = Math.min(overlapInitial / (penetrationSpeed + 1e-6), maxRewind);
          if (rewindTime > 0) {
            rewindStone(stoneA, rewindTime);
            rewindStone(stoneB, rewindTime);
            dx = stoneB.position.x - stoneA.position.x;
            dy = stoneB.position.y - stoneA.position.y;
            distance = Math.hypot(dx, dy);
            if (distance > COLLISION_EPSILON) {
              normalX = dx / distance;
              normalY = dy / distance;
            }
            relVelAlongNormal =
              ((stoneA.velocity.vx ?? 0) - (stoneB.velocity.vx ?? 0)) * normalX +
              ((stoneA.velocity.vy ?? 0) - (stoneB.velocity.vy ?? 0)) * normalY;
          }
        }

        distance = Math.hypot(dx, dy);
        const overlapAfterRewind = Math.max(0, minDistance - distance);
        if (rewindTime === 0 && overlapAfterRewind > COLLISION_EPSILON) {
          const correction = overlapAfterRewind * 0.5;
          stoneA.position.x -= normalX * correction;
          stoneA.position.y -= normalY * correction;
          stoneB.position.x += normalX * correction;
          stoneB.position.y += normalY * correction;
        }

        const relVelX = (stoneA.velocity.vx ?? 0) - (stoneB.velocity.vx ?? 0);
        const relVelY = (stoneA.velocity.vy ?? 0) - (stoneB.velocity.vy ?? 0);
        relVelAlongNormal = relVelX * normalX + relVelY * normalY;

        if (relVelAlongNormal > SPEED_EPSILON) {
          const impulse = (1 + restitution) * relVelAlongNormal * 0.5;
          stoneA.velocity.vx = (stoneA.velocity.vx ?? 0) - impulse * normalX;
          stoneA.velocity.vy = (stoneA.velocity.vy ?? 0) - impulse * normalY;
          stoneB.velocity.vx = (stoneB.velocity.vx ?? 0) + impulse * normalX;
          stoneB.velocity.vy = (stoneB.velocity.vy ?? 0) + impulse * normalY;
        }

        const tangentX = -normalY;
        const tangentY = normalX;
        const relVelTangential = relVelX * tangentX + relVelY * tangentY;
        if (Math.abs(relVelTangential) > SPEED_EPSILON && tangentialLoss > 0) {
          const tangentialImpulse = relVelTangential * tangentialLoss * 0.5;
          stoneA.velocity.vx -= tangentialImpulse * tangentX;
          stoneA.velocity.vy -= tangentialImpulse * tangentY;
          stoneB.velocity.vx += tangentialImpulse * tangentX;
          stoneB.velocity.vy += tangentialImpulse * tangentY;
        }

        const rotationA = stoneA.rotationRate ?? 0;
        const rotationB = stoneB.rotationRate ?? 0;
        const spinSurfaceVelocity = (rotationA - rotationB) * radius;
        const combinedTangential = relVelTangential + spinSurfaceVelocity;

        if (Math.abs(combinedTangential) > SPEED_EPSILON && spinTransfer > 0) {
          const angularDelta = (combinedTangential / radius) * spinTransfer * 0.5;
          stoneA.rotationRate = rotationA - angularDelta;
          stoneB.rotationRate = rotationB + angularDelta;
          stoneA.rotationActivated = true;
          stoneB.rotationActivated = true;
          if (spinDamping > 0) {
            stoneA.rotationRate *= 1 - spinDamping;
            stoneB.rotationRate *= 1 - spinDamping;
          }
        }

        if (Math.abs(stoneA.rotationRate ?? 0) > 0) {
          stoneA.hasStoppedNotified = false;
        }
        if (Math.abs(stoneB.rotationRate ?? 0) > 0) {
          stoneB.hasStoppedNotified = false;
        }

        if (rewindTime > 0) {
          advanceStone(stoneA, rewindTime);
          advanceStone(stoneB, rewindTime);
        }

        generatedMotion = true;
      }
    }

    return generatedMotion;
  }

  computeCurlHeadingDelta(stone, speed, displacement, deltaSeconds) {
    const rotationRate = stone.rotationRate ?? 0;
    const spinDirection = Math.sign(rotationRate);
    const minOmega = this.curlMinOmega ?? DEFAULT_CURL_MIN_OMEGA;
    if (spinDirection === 0 || Math.abs(rotationRate) < minOmega) {
      return 0;
    }
    const direction = -spinDirection;

    const effectiveSpeed = Math.max(
      speed,
      this.curlMinSpeed ?? DEFAULT_CURL_MIN_SPEED
    );
    if (effectiveSpeed <= SPEED_EPSILON) {
      return 0;
    }

    const rotationRef = Math.max(
      this.curlRotationReference ?? DEFAULT_CURL_ROTATION_REFERENCE,
      SPEED_EPSILON
    );
    const rotationFactor = Math.min(Math.abs(rotationRate) / rotationRef, 1);
    if (rotationFactor <= 0) {
      return 0;
    }

    const asymmetry = this.curlAsymmetry ?? DEFAULT_CURL_ASYMMETRY;
    const velocityBias = Math.max(this.curlVelocityBias ?? DEFAULT_CURL_VELOCITY_BIAS, 0);
    const velocityScaling = 1 / (effectiveSpeed + velocityBias);

    const lateralAcceleration = GRAVITY * asymmetry * direction * rotationFactor * velocityScaling;

    const approxTimeStep =
      deltaSeconds ??
      (displacement > 0 ? displacement / Math.max(effectiveSpeed, SPEED_EPSILON) : 0);
    if (approxTimeStep <= 0) {
      return 0;
    }

    const headingDelta = (lateralAcceleration / effectiveSpeed) * approxTimeStep;
    const MAX_DELTA = 0.35;
    return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, headingDelta));
  }
}
