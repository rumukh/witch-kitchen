"""Run ACE-Step 1.5 jobs in-process with the ace-step-music skill's settings.

C:\\AI\\ACE-Step-1.5\\.venv\\Scripts\\python.exe tools/audio/ace_local.py jobs.json

Used because the Gradio-mounted /release_task API on this install cannot take a
source audio (needed for "cover"), and the vLLM planner's fixed VRAM reservation
pushed the XL DiT into shared memory on this 16 GB GPU. Settings match the skill:
acestep-v15-xl-sft, INT8 weight-only, CPU + DiT offload, flash attention, 50 ODE
steps, guidance 7.0, shift 3.0, batch 1, FLAC; planner acestep-5Hz-lm-1.7B with
the PyTorch backend (offloadable) only for text2music jobs.

jobs.json: [{"id", "task": "text2music"|"cover", "caption", "bpm", "key", "duration",
             "src" (cover), "strength" (cover), "seed" (optional), "out"}]
Finished jobs write <out>.json and are skipped on rerun.
"""
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = r"C:\AI\ACE-Step-1.5"
sys.path.insert(0, ROOT)

from acestep.handler import AceStepHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402


def main(jobs_path):
    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8-sig"))
    todo = [j for j in jobs if not Path(j["out"]).with_suffix(".json").exists()]
    if not todo:
        print("nothing to do")
        return
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=ROOT, config_path="acestep-v15-xl-sft", device="cuda",
                                     use_flash_attention=True, compile_model=False, offload_to_cpu=True,
                                     offload_dit_to_cpu=True, quantization="int8_weight_only")
    if not ok:
        raise SystemExit(msg)
    llm = None
    if any(j["task"] == "text2music" for j in todo):
        llm = LLMHandler()
        lmsg, lok = llm.initialize(checkpoint_dir=ROOT + r"\checkpoints", lm_model_path="acestep-5Hz-lm-1.7B",
                                   backend="pt", device="cuda", offload_to_cpu=True)
        if not lok:
            raise SystemExit(lmsg)
    for j in todo:
        t0 = time.time()
        cover = j["task"] == "cover"
        params = GenerationParams(
            task_type=j["task"], caption=j["caption"], lyrics="[Instrumental]", instrumental=True,
            src_audio=j.get("src") if cover else None, audio_cover_strength=j.get("strength", 1.0),
            bpm=j["bpm"], keyscale=j["key"], timesignature="4/4", duration=float(j["duration"]),
            inference_steps=50, guidance_scale=7.0, shift=3.0, infer_method="ode",
            seed=int(j.get("seed", -1)), thinking=not cover, use_cot_caption=not cover,
            use_cot_language=not cover, vocal_language="en")
        config = GenerationConfig(batch_size=1, audio_format="flac", use_random_seed=j.get("seed", -1) < 0)
        save_dir = Path(ROOT) / "outputs" / "krestets-local"
        save_dir.mkdir(parents=True, exist_ok=True)
        res = generate_music(dit, llm if not cover else None, params, config, save_dir=str(save_dir))
        if not res.success or not res.audios:
            print("FAILED", j["id"], res.error, res.status_message)
            continue
        audio = res.audios[0]
        shutil.copyfile(audio["path"], j["out"])
        meta = {"id": j["id"], "job": j, "seconds": round(time.time() - t0, 1),
                "params": {k: v for k, v in (audio.get("params") or {}).items() if isinstance(v, (str, int, float, bool, type(None)))},
                "seed": (audio.get("params") or {}).get("seed", audio.get("seed")),
                "settings": "acestep-v15-xl-sft INT8, offload cpu+dit, flash-attn, 50 ODE steps, guidance 7.0, shift 3.0; "
                            + ("cover (no LM)" if cover else "LM acestep-5Hz-lm-1.7B (pt backend) thinking")}
        Path(j["out"]).with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str),
                                                       encoding="utf-8")
        print("DONE", j["id"], j["out"], meta["seconds"], "s", "seed", meta["seed"], flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
