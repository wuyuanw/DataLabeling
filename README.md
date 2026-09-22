# SOP 数据工作台

基于 Vue 3、Electron 和 Element Plus 的本地图片标注工作台。目前支持加载图片、绘制类别框以及保存 YOLO TXT 标注。

## 视频抽帧与自动标注

应用通过独立 Conda Python 进程完成视频抽帧和本地 YOLO 推理。输出目录结构如下：

```text
选择的输出目录/
└─ 视频名_时间_任务ID/
   ├─ images/       # OpenCV 抽取的 JPG 图片
   ├─ labels/       # 与图片同名的 YOLO TXT 标签
   ├─ logs/
   ├─ classes.txt   # 模型类别及编号顺序
   └─ job.json      # 模型、参数、统计和任务状态
```

### 创建 Conda 环境

```powershell
conda create -n sop-yolo python=3.11 -y
conda activate sop-yolo
```

GPU 用户先根据 PyTorch 官方安装选择器安装与本机匹配的 CUDA 版 PyTorch，再执行：

```powershell
python -m pip install --upgrade pip
python -m pip install -r worker/requirements.txt
python -c "import torch, cv2, ultralytics; print(torch.cuda.is_available(), ultralytics.__version__)"
```

启动应用后，在“视频抽帧与预标注”面板依次完成：

1. 选择 Conda 环境目录中的 `python.exe`。应用会保存该配置并检查依赖和 CUDA。
2. 选择视频和本地 Ultralytics `.pt` 检测模型。
3. 选择输出目录并调整抽帧间隔、最大数量、置信度和推理设备。
4. 点击“开始抽帧”。第一张推理结果生成后即可在中央画布浏览和修正。
5. 点击“保存标注”会覆盖当前任务对应的 `labels/*.txt`。

### 标注编辑与复核

- 点击标注框后可拖动位置，并通过四角控制点调整大小。
- 选中标注框后切换类别，会同步修改该框的类别；`Delete` 删除选中框。
- `Ctrl+Z` 撤销、`Ctrl+Y` 或 `Ctrl+Shift+Z` 重做、`Ctrl+S` 保存。
- 鼠标滚轮缩放图片，按住空格并拖动可平移画布，点击缩放百分比恢复视图。
- 自动标注框使用实线并显示置信度，人工框使用虚线，人工修正的自动框使用点线。
- 队列支持“待审核、已修改、已审核、无目标”筛选；切换图片前会自动保存未提交的标签。
- 没有标注框的图片可明确标记为“无目标”，避免与尚未处理的图片混淆。

### `No matching distribution found for ultralytics`

此错误通常表示当前 pip 镜像没有同步该包，或当前 Python/pip 并非刚创建的 Conda 环境。先检查：

```powershell
where python
python --version
python -m pip --version
python -m pip config list
python -m pip index versions ultralytics -i https://pypi.org/simple
```

然后明确使用官方 PyPI 安装：

```powershell
python -m pip install --upgrade pip -i https://pypi.org/simple
python -m pip install ultralytics opencv-python -i https://pypi.org/simple
```

如果仍然显示 `from versions: none`，请确认网络或代理能访问 `https://pypi.org/simple/ultralytics/`，并重新创建 Python 3.11 环境，不要在 base 环境中混装。

## 开发命令

```bash
npm install
npm run dev
```

其他命令：

- `npm run build`：生成生产环境前端资源。
- `npm run preview`：仅在浏览器中预览生产构建。
- `npm run capture`：构建并通过 Electron 生成 `ui-preview.png`。
- `npm start`：启动已经通过 `npm run build` 构建好的 Electron 应用。

## 目录结构

```text
electron/
├─ ipc/                 # 需要系统权限的 IPC 处理器
├─ main.cjs             # Electron 生命周期与模块注册
├─ preload.cjs          # 向页面暴露最小安全 API
└─ window.cjs           # BrowserWindow 创建与页面加载
src/
├─ assets/styles/       # 全局变量、基础样式及 Element Plus 覆盖
├─ components/
│  ├─ layout/           # 页面级通用布局组件
│  └─ workspace/        # 标注工作台业务组件
├─ composables/         # 页面状态和业务流程
├─ constants/           # 项目、类别等静态配置
├─ services/            # Electron/浏览器平台能力适配
├─ utils/               # 无副作用的格式转换工具
├─ views/               # 页面组装层
├─ App.vue              # 根组件
└─ main.js              # Vue 应用入口
```

## 代码边界

- `AnnotationWorkspace.vue` 只组装页面并连接组件事件。
- `useAnnotationWorkspace.js` 管理工作台状态、统计与保存流程。
- `AnnotationEditor.vue` 负责指针坐标转换和标注框绘制。
- `yolo.js` 负责可独立测试的 YOLO 格式序列化。
- `labelFileService.js` 统一 Electron 保存与浏览器下载行为。
- Electron 渲染进程不能直接访问 Node.js；文件写入只能通过 `preload.cjs` 暴露的受限 IPC 完成。

新增功能时应优先放入对应业务层，避免再次将系统调用、状态和大段模板集中到 `App.vue`。
