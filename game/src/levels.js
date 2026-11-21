// The three nights of MOTH & KEY, written as 32 x 18 tile maps. Each map is the level: walls,
// crates and desks block sight and feet; shadow tiles swallow light; K is the keycard on its desk;
// E is the exit door; P is where the Moth comes in. Guards are listed with their patrol loops in
// tile coordinates, and lamps are pools of warm light painted over the floor.
//
// Legend:  #  wall      c  crate      d  desk      K  keycard desk (solid, take from beside it)
//          s  shadow    .  lit floor  E  exit      P  player start

export const TILE_CHAR = {
  WALL: '#',
  CRATE: 'c',
  DESK: 'd',
  KEYCARD: 'K',
  SHADOW: 's',
  EXIT: 'E',
  START: 'P',
  FLOOR: '.',
};

const READING_ROOM = `
################################
#..............................#
#..............................#
#....####..........####........#
#E...####..........####........#
#..............................#
#..........dddd................#
#..........dddK.......c........#
#.....................c........#
#....dddd......................#
#..............................#
#....ssss..............ssss....#
#....ssss..............ssss....#
#..............................#
#....##................##......#
#....##.......c........##......#
#..........................P...#
################################
`;

const LONG_GALLERY = `
################################
#..............................#
#....dddd......####......dddd..#
#E.............................#
#....c.........#..#........c...#
#....c.........#..#........c...#
#..............................#
#....##..............##........#
#....##......ddK.....##........#
#..............................#
#..........................##..#
#....ssss..............ssss....#
#....ssss.......dddd...ssss....#
#..............................#
#........c..........c..........#
#..............................#
#..........................P...#
################################
`;

const CLOCK_FLOOR = `
################################
#.......#.........#............#
#.......#.........#............#
#..dd...#....ss...#....dd......#
#E......#....ss...#....dd......#
#.......#.........#............#
#....c..#.........#....c.......#
#.......###.....###............#
#.............ddK..............#
#........###.....###...........#
#....c..#.........#....c.......#
#..ss...#.........#....ss......#
#..ss...#....dd...#....ss......#
#.......#.........#............#
#..dd...#.........#....dd......#
#.......#.........#............#
#..........................P...#
################################
`;

/**
 * The levels in play order. `par` is the unhurried time for three stars' worth of nerve, shown on
 * the clear screen; `routes` are the guards' loops; `lamps` are warm pools, x and y in tiles.
 */
export const LEVELS = [
  {
    key: 'reading-room',
    name: 'The Reading Room',
    night: 'Night one',
    place: 'The east archive',
    par: 95,
    grid: READING_ROOM,
    routes: [
      [[10, 4], [17, 4], [17, 10], [10, 10]],
      [[3, 13], [3, 16], [18, 16], [18, 13]],
    ],
    lamps: [[9, 5, 2.6], [23, 9, 2.4], [16, 13, 2.2], [6, 2, 1.9]],
  },
  {
    key: 'long-gallery',
    name: 'The Long Gallery',
    night: 'Night two',
    place: 'The west wing',
    par: 120,
    grid: LONG_GALLERY,
    routes: [
      [[4, 3], [12, 3], [12, 10], [4, 10]],
      [[23, 3], [23, 15], [17, 15], [17, 16], [23, 16]],
      [[10, 6], [20, 6], [20, 13], [10, 13]],
    ],
    lamps: [[9, 2, 2.4], [16, 6, 2.6], [25, 9, 2.4], [12, 13, 2.2], [20, 16, 2.0]],
  },
  {
    key: 'clock-floor',
    name: 'The Clock Floor',
    night: 'Night three',
    place: "The keeper's floor",
    par: 150,
    grid: CLOCK_FLOOR,
    routes: [
      [[2, 2], [6, 2], [6, 16], [2, 16]],
      [[21, 2], [29, 2], [29, 16], [21, 16]],
      [[11, 6], [16, 6], [16, 3], [11, 3]],
      [[11, 11], [16, 11], [16, 13], [11, 13]],
    ],
    lamps: [[4, 8, 2.4], [27, 8, 2.4], [12, 4, 2.2], [20, 12, 2.2], [16, 16, 1.8]],
  },
];
