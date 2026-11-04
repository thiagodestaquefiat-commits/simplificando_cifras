"""Decode untrusted uploads and re-encode audio only. Never serve original bytes."""
import io
import time
from fractions import Fraction
from ..errors import ApiError

MAX_BYTES = 3 * 1024 * 1024
MAX_SECONDS = 90


def normalize_audio(raw):
    import av
    if not raw or len(raw) > MAX_BYTES:
        raise ApiError("audio_invalido", "Áudio vazio ou maior que 3 MB.", 400)
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
            deadline = time.monotonic() + 20
            def encode(frames):
                nonlocal samples
                for frame in frames:
                    frame.pts = samples
                    frame.time_base = Fraction(1, 48000)
                    samples += frame.samples
                    if samples > 48000 * MAX_SECONDS or time.monotonic() > deadline:
                        raise ValueError("limit")
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
    except Exception:
        raise ApiError("audio_invalido", "Não foi possível validar o áudio. Grave até 90 segundos e tente novamente.", 400) from None
