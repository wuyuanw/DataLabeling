"""视频抽帧与 Ultralytics YOLO 自动标注 Worker。

Electron 通过 stdin 传入一份 JSON 请求；Worker 通过 stdout 输出带
SOP_EVENT 前缀的 NDJSON 事件。其他库日志不会被 Electron 当作业务事件解析。
"""

from __future__ import annotations

import json
import math
import re
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any


EVENT_PREFIX = "SOP_EVENT:"


def emit(event_type: str, **payload: Any) -> None:
    message = {"type": event_type, **payload}
    print(
        EVENT_PREFIX + json.dumps(message, ensure_ascii=False),
        flush=True,
    )


try:
    import cv2
    import torch
    from ultralytics import YOLO
    from ultralytics.utils import LOGGER
except ImportError as error:
    emit(
        "error",
        message=(
            f"Python 环境缺少依赖：{error}. "
            "请在所选 Conda 环境中安装 ultralytics、torch 和 opencv-python。"
        ),
    )
    raise SystemExit(1) from error


def safe_folder_name(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    return value.strip(" .") or "video"


def ordered_model_names(model: YOLO) -> list[str]:
    names = model.names
    if isinstance(names, dict):
        return [str(names[index]) for index in sorted(names)]
    return [str(name) for name in names]


def write_json(path: Path, content: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(content, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def create_output_directory(
    output_root: Path,
    video_path: Path,
    job_id: str,
) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    directory = output_root / (
        f"{safe_folder_name(video_path.stem)}_{timestamp}_{job_id[:8]}"
    )
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "images").mkdir()
    (directory / "labels").mkdir()
    (directory / "logs").mkdir()
    return directory


def resolve_device(requested_device: Any) -> int | str:
    if requested_device in (None, "", "auto"):
        return 0 if torch.cuda.is_available() else "cpu"
    if str(requested_device).lower() == "cpu":
        return "cpu"
    if not torch.cuda.is_available():
        raise RuntimeError("指定了 CUDA 推理，但当前 Conda 环境无法使用 CUDA")
    return int(requested_device)


def load_model(model_path: Path) -> tuple[YOLO, list[str]]:
    emit("phase", phase="loading_model", message="正在加载 YOLO 模型")
    LOGGER.setLevel("ERROR")
    model = YOLO(str(model_path))
    if getattr(model, "task", None) != "detect":
        raise RuntimeError(
            f"当前模型任务为 {model.task!r}，目前只支持 detect 检测模型"
        )
    names = ordered_model_names(model)
    emit("model_info", task=model.task, classNames=names)
    return model, names


def extract_frames(
    video_path: Path,
    images_directory: Path,
    interval: int,
    max_frames: int,
) -> list[Path]:
    emit("phase", phase="extracting", message="正在抽取视频帧")
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("无法打开视频，请检查文件或视频编码是否受支持")

    total_source_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    expected_count = (
        min(max_frames, math.ceil(total_source_frames / interval))
        if total_source_frames > 0
        else max_frames
    )
    extracted_paths: list[Path] = []
    source_frame_index = 0

    try:
        while len(extracted_paths) < max_frames:
            success, frame = capture.read()
            if not success:
                break

            if source_frame_index % interval == 0:
                file_name = f"frame_{source_frame_index:08d}.jpg"
                output_path = images_directory / file_name
                saved = cv2.imwrite(
                    str(output_path),
                    frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 95],
                )
                if not saved:
                    raise RuntimeError(f"保存抽帧图片失败：{output_path}")
                extracted_paths.append(output_path)
                emit(
                    "progress",
                    phase="extracting",
                    current=len(extracted_paths),
                    total=expected_count,
                    sourceFrame=source_frame_index,
                    fileName=file_name,
                )
            source_frame_index += 1
    finally:
        capture.release()

    if not extracted_paths:
        raise RuntimeError("视频中没有抽取到有效图片")
    return extracted_paths


def convert_box_to_ui(
    class_id: int,
    confidence: float,
    xywh: list[float],
) -> dict[str, Any]:
    center_x, center_y, width, height = xywh
    return {
        "classIndex": class_id,
        "confidence": round(confidence, 6),
        "x": max(0.0, (center_x - width / 2) * 100),
        "y": max(0.0, (center_y - height / 2) * 100),
        "w": min(100.0, width * 100),
        "h": min(100.0, height * 100),
    }


def get_source_frame(image_path: Path) -> int | None:
    """从 frame_00000123.jpg 中恢复原视频帧号。"""
    try:
        return int(image_path.stem.rsplit("_", 1)[-1])
    except ValueError:
        return None


def run_inference(
    model: YOLO,
    image_paths: list[Path],
    labels_directory: Path,
    confidence: float,
    image_size: int,
    device: int | str,
) -> dict[str, int]:
    emit(
        "phase",
        phase="inferencing",
        message=f"正在自动标注，推理设备：{device}",
    )
    results = model.predict(
        source=[str(path) for path in image_paths],
        conf=confidence,
        imgsz=image_size,
        device=device,
        stream=True,
        verbose=False,
    )
    total_boxes = 0
    labeled_images = 0

    for current, result in enumerate(results, start=1):
        image_path = Path(result.path)
        label_path = labels_directory / f"{image_path.stem}.txt"
        label_rows: list[str] = []
        ui_boxes: list[dict[str, Any]] = []

        if result.boxes is not None and len(result.boxes) > 0:
            classes = result.boxes.cls.cpu().tolist()
            confidences = result.boxes.conf.cpu().tolist()
            normalized_boxes = result.boxes.xywhn.cpu().tolist()
            for class_value, confidence_value, xywh in zip(
                classes,
                confidences,
                normalized_boxes,
            ):
                class_id = int(class_value)
                coordinates = " ".join(
                    f"{coordinate:.6f}" for coordinate in xywh
                )
                label_rows.append(f"{class_id} {coordinates}")
                ui_boxes.append(
                    convert_box_to_ui(
                        class_id,
                        float(confidence_value),
                        xywh,
                    )
                )

        # 空文件明确表示该帧已经推理，但没有检测到目标。
        label_path.write_text(
            "\n".join(label_rows) + ("\n" if label_rows else ""),
            encoding="utf-8",
        )
        box_count = len(label_rows)
        total_boxes += box_count
        labeled_images += int(box_count > 0)
        emit(
            "item",
            phase="inferencing",
            current=current,
            total=len(image_paths),
            fileName=image_path.name,
            labelFileName=label_path.name,
            sourceFrame=get_source_frame(image_path),
            boxCount=box_count,
            boxes=ui_boxes,
        )

    return {
        "boxCount": total_boxes,
        "labeledImageCount": labeled_images,
    }


def register_unlabeled_frames(
    image_paths: list[Path],
    labels_directory: Path,
) -> None:
    """关闭自动标注时仍建立空标签和页面队列。"""
    emit("phase", phase="queueing", message="正在建立人工标注队列")
    for current, image_path in enumerate(image_paths, start=1):
        label_path = labels_directory / f"{image_path.stem}.txt"
        label_path.write_text("", encoding="utf-8")
        emit(
            "item",
            phase="queueing",
            current=current,
            total=len(image_paths),
            fileName=image_path.name,
            labelFileName=label_path.name,
            sourceFrame=get_source_frame(image_path),
            boxCount=0,
            boxes=[],
        )


def main() -> None:
    request = json.loads(sys.stdin.read())
    job_id = str(request["jobId"])
    video_path = Path(request["videoPath"]).resolve()
    model_path = Path(request["modelPath"]).resolve()
    output_root = Path(request["outputRoot"]).resolve()
    interval = int(request.get("interval", 15))
    max_frames = int(request.get("maxFrames", 300))
    confidence = float(request.get("confidence", 0.35))
    image_size = int(request.get("imageSize", 640))
    auto_label = bool(request.get("autoLabel", True))

    if interval < 1 or max_frames < 1:
        raise ValueError("抽帧间隔和最大抽帧数必须大于 0")
    if not 0 <= confidence <= 1:
        raise ValueError("置信度必须在 0 到 1 之间")
    if not video_path.is_file():
        raise FileNotFoundError(f"视频不存在：{video_path}")
    if not model_path.is_file():
        raise FileNotFoundError(f"模型不存在：{model_path}")
    if not output_root.is_dir():
        raise NotADirectoryError(f"输出目录不存在：{output_root}")

    output_directory = create_output_directory(output_root, video_path, job_id)
    images_directory = output_directory / "images"
    labels_directory = output_directory / "labels"
    manifest_path = output_directory / "job.json"
    emit("started", jobId=job_id, outputDir=str(output_directory))

    manifest: dict[str, Any] = {
        "jobId": job_id,
        "status": "processing",
        "videoPath": str(video_path),
        "modelPath": str(model_path),
        "outputDir": str(output_directory),
        "interval": interval,
        "maxFrames": max_frames,
        "confidence": confidence,
        "imageSize": image_size,
        "autoLabel": auto_label,
        "startedAt": datetime.now().isoformat(),
    }
    write_json(manifest_path, manifest)

    try:
        model, model_names = load_model(model_path)
        device = resolve_device(request.get("device", "auto"))
        (output_directory / "classes.txt").write_text(
            "\n".join(model_names) + "\n",
            encoding="utf-8",
        )
        image_paths = extract_frames(
            video_path,
            images_directory,
            interval,
            max_frames,
        )
        summary = {"boxCount": 0, "labeledImageCount": 0}
        if auto_label:
            summary = run_inference(
                model,
                image_paths,
                labels_directory,
                confidence,
                image_size,
                device,
            )
        else:
            register_unlabeled_frames(image_paths, labels_directory)

        manifest.update(
            {
                "status": "completed",
                "device": str(device),
                "classNames": model_names,
                "imageCount": len(image_paths),
                **summary,
                "completedAt": datetime.now().isoformat(),
            }
        )
        write_json(manifest_path, manifest)
        emit(
            "done",
            outputDir=str(output_directory),
            imageCount=len(image_paths),
            **summary,
        )
    except Exception as error:
        manifest.update(
            {
                "status": "failed",
                "error": str(error),
                "failedAt": datetime.now().isoformat(),
            }
        )
        write_json(manifest_path, manifest)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - 顶层需要转换为 IPC 错误事件
        emit(
            "error",
            message=str(error),
            traceback=traceback.format_exc(),
        )
        raise SystemExit(1) from error
