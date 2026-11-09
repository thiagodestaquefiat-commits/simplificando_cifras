"""Decode untrusted uploads and re-encode audio only. Never serve original bytes."""
import io
import time
from fractions import Fraction
from ..errors import ApiError

MAX_BYTES = 3 * 1024 * 1024
MAX_SECONDS = 90
SAMPLE_RATE = 48000
# Recorder timers and codec padding can exceed the boundary by a fraction of a second.
PADDING_SAMPLES = SAMPLE_RATE // 4


def normalize_audio(raw):
    try:
        import av
    except (ImportError, OSError):
        raise ApiError("audio_conversor_indisponivel", "Conversão de áudio indisponível no servidor. Tente novamente mais tarde.", 503) from None
    if len(raw) > MAX_BYTES:
        raise ApiError("audio_grande", "Áudio maior que 3 MB.", 413)
    if not raw:
        raise ApiError("audio_invalido", "A gravação está vazia. Grave novamente.", 400)
    output = io.BytesIO()
    try:
        with av.open(io.BytesIO(raw)) as source, av.open(output, "w", format="mp4") as target:
            streams = list(source.streams.audio)
            if not streams:
                raise ValueError("no audio")
            stream = target.add_stream("aac", rate=48000)
            stream.layout = "mono"
            stream.bit_rate = 64000
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=48000)
            samples = 0
            decoded = 0
            max_samples = SAMPLE_RATE * MAX_SECONDS
            deadline = time.monotonic() + 20
            def encode(frames):
                nonlocal samples, decoded
                for frame in frames:
                    if time.monotonic() > deadline:
                        raise ApiError("audio_conversao_demora", "O servidor demorou para processar o áudio. Tente novamente.", 503)
                    decoded += frame.samples
                    if decoded > max_samples + PADDING_SAMPLES:
                        raise ApiError("audio_duracao", "A gravação excede 90 segundos. Grave um áudio mais curto.", 400)
                    remaining = max_samples - samples
                    if remaining <= 0:
                        continue
                    if frame.samples > remaining:
                        trimmed = av.AudioFrame(format="fltp", layout="mono", samples=remaining)
                        trimmed.sample_rate = SAMPLE_RATE
                        trimmed.planes[0].update(bytes(frame.planes[0])[:remaining * 4])
                        frame = trimmed
                    frame.pts = samples
                    frame.time_base = Fraction(1, 48000)
                    samples += frame.samples
                    for packet in stream.encode(frame):
                        target.mux(packet)
            for frame in source.decode(streams[0]):
                encode(resampler.resample(frame))
            encode(resampler.resample(None))
            if samples < 4800:
                raise ValueError("too short")
            for packet in stream.encode(None):
                target.mux(packet)
        data = output.getvalue()
        if len(data) > MAX_BYTES:
            raise ValueError("size")
        return data, round(samples / 48000, 2)
    except ApiError:
        raise
    except (av.FFmpegError, ValueError, OSError):
        raise ApiError("audio_invalido", "Não foi possível ler a gravação. Grave novamente.", 400) from None
