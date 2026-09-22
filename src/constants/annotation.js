/**
 * 工作台中的静态业务配置。
 * 后续接入后端后，项目和类别列表可由接口替换，组件层无需改动。
 */
export const PROJECTS = [
  '螺纹套 SOP 数据集',
  '装配检测数据集',
  '工位安全数据集',
]

// export const ANNOTATION_CLASSES = [
//   { name: 'part_on_a_fixture', color: '#4bd5e8' },
//   { name: 'part_on_b_fixture', color: '#25c7c9' },
//   { name: 'ab_hole_blue', color: '#237ae5' },
//   { name: 'c_hole_blue', color: '#20afe6' },
//   { name: 'a_hole_roi', color: '#28dfbd' },
//   { name: 'b_hole_roi', color: '#29d7b3' },
//   { name: 'c_hole_roi', color: '#2fcfac' },
//   { name: 'hammer', color: '#ff714d' },
//   { name: 'pin_punch', color: '#f64873' },
// ]


export const ANNOTATION_CLASSES = [
  { name: '标注框1', color: '#4bd5e8' },
  { name: '标注框2', color: '#25c7c9' },
  { name: '标注框3', color: '#237ae5' },
  { name: '标注框4', color: '#20afe6' },
  { name: '标注框5', color: '#28dfbd' },
  { name: '标注框6', color: '#29d7b3' },
  { name: '标注框7', color: '#2fcfac' },
  { name: '标注框8', color: '#ff714d' },
  { name: '标注框9', color: '#f64873' },
]

export const DEFAULT_EXTRACTION_FORM = Object.freeze({
  interval: 15,
  maxFrames: 300,
  confidence: 0.35,
  imageSize: 640,
  device: 'auto',
  ratio: 0.2,
})
