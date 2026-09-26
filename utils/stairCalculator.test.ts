import { describe, it, expect } from 'vitest';
import { calculateStair, getStairSummary } from './stairCalculator';
import { DEFAULT_STAIR_PARAMS, StairConfig, Floor } from '../types';

const floors: Floor[] = [
    { id: 0, label: 'Ground', height: 3.4 },
    { id: 1, label: 'Level 1', height: 3 },
    { id: 2, label: 'Level 2', height: 3 },
];

describe('calculateStair', () => {
    it('sums floor heights between the two floors, in either direction', () => {
        expect(calculateStair(DEFAULT_STAIR_PARAMS, floors, 0, 2).totalRise).toBeCloseTo(6.4);
        expect(calculateStair(DEFAULT_STAIR_PARAMS, floors, 2, 0).totalRise).toBeCloseTo(6.4);
        expect(calculateStair(DEFAULT_STAIR_PARAMS, floors, 1, 2).totalRise).toBeCloseTo(3);
    });

    it('never exceeds the requested riser height and reaches the floor exactly', () => {
        const r = calculateStair(DEFAULT_STAIR_PARAMS, floors, 0, 1);
        expect(r.numRisers).toBe(20); // 3.4 / 0.17
        expect(r.actualRiserHeight).toBeLessThanOrEqual(DEFAULT_STAIR_PARAMS.riserHeight + 1e-9);
        expect(r.actualRiserHeight * r.numRisers).toBeCloseTo(r.totalRise);
    });

    it.each<StairConfig>(['straight', 'l-shaped', 'u-shaped', 'spiral'])('%s: flights add up to the full stair', config => {
        const r = calculateStair({ ...DEFAULT_STAIR_PARAMS, config }, floors, 0, 1);
        expect(r.flights.reduce((s, f) => s + f.risers, 0)).toBe(r.numRisers);
        expect(r.flights.reduce((s, f) => s + f.flightRise, 0)).toBeCloseTo(r.totalRise);
        expect(r.totalArea).toBeGreaterThan(0);
        expect(r.totalRunLength).toBeGreaterThan(0);
    });

    it('adds a landing for L- and U-shaped stairs only', () => {
        const landings = (config: StairConfig) => calculateStair({ ...DEFAULT_STAIR_PARAMS, config }, floors, 0, 1).numLandings;
        expect(landings('straight')).toBe(0);
        expect(landings('l-shaped')).toBe(1);
        expect(landings('u-shaped')).toBe(1);
    });

    it('checks the 2R+T comfort rule', () => {
        expect(calculateStair(DEFAULT_STAIR_PARAMS, floors, 0, 1).meetsCode).toBe(true);
        expect(calculateStair({ ...DEFAULT_STAIR_PARAMS, treadDepth: 0.15 }, floors, 0, 1).meetsCode).toBe(false);
    });

    it('returns an empty result when there is no rise', () => {
        const r = calculateStair(DEFAULT_STAIR_PARAMS, floors, 1, 1);
        expect(r.numRisers).toBe(0);
        expect(getStairSummary(r)).toBe('No rise to calculate.');
    });
});
