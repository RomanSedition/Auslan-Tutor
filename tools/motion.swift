// Find where the signing actually happens in a Signbank clip, so the phrase player can skip
// the still lead-in and lead-out (signer standing with hands down).
//
// Usage: motion <video.mp4> [more.mp4 ...]
// Prints one JSON line per file: {"file": ..., "duration": s, "start": s, "end": s, "fps": n}
// macOS only (AVFoundation). The video must be a local file.
//
// Method: decode frames, sample a coarse luminance grid, and measure how much each frame differs
// from the previous one. Frames well above the clip's own background noise count as "moving".
// start/end are the first/last moving frames, padded slightly so the sign isn't clipped.
import AVFoundation
import Foundation

func analyse(_ path: String) -> [String: Any] {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    let sem = DispatchSemaphore(value: 0)
    var track: AVAssetTrack?
    var duration = 0.0
    Task {
        track = try? await asset.loadTracks(withMediaType: .video).first
        duration = (try? await asset.load(.duration).seconds) ?? 0
        sem.signal()
    }
    sem.wait()
    guard let track, duration > 0, let reader = try? AVAssetReader(asset: asset) else {
        return ["file": path, "error": "unreadable"]
    }
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    reader.startReading()

    var times: [Double] = []
    var diffs: [Double] = []
    var prev: [Float] = []
    let grid = 48 // sample a 48×48 grid of pixels

    while let sample = output.copyNextSampleBuffer() {
        guard let px = CMSampleBufferGetImageBuffer(sample) else { continue }
        let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
        CVPixelBufferLockBaseAddress(px, .readOnly)
        let w = CVPixelBufferGetWidth(px), h = CVPixelBufferGetHeight(px)
        let row = CVPixelBufferGetBytesPerRow(px)
        let base = CVPixelBufferGetBaseAddress(px)!.assumingMemoryBound(to: UInt8.self)
        var cur = [Float](repeating: 0, count: grid * grid)
        for gy in 0..<grid {
            let y = (gy * h) / grid + h / (2 * grid)
            for gx in 0..<grid {
                let x = (gx * w) / grid + w / (2 * grid)
                let p = base + y * row + x * 4
                cur[gy * grid + gx] = 0.114 * Float(p[0]) + 0.587 * Float(p[1]) + 0.299 * Float(p[2])
            }
        }
        CVPixelBufferUnlockBaseAddress(px, .readOnly)
        if !prev.isEmpty {
            var s: Float = 0
            for i in 0..<cur.count { s += abs(cur[i] - prev[i]) }
            diffs.append(Double(s) / Double(cur.count))
            times.append(t)
        }
        prev = cur
    }
    guard diffs.count > 4 else { return ["file": path, "duration": duration, "start": 0, "end": duration] }

    let sorted = diffs.sorted()
    let noise = sorted[Int(Double(sorted.count) * 0.2)]
    let peak = sorted[Int(Double(sorted.count - 1) * 0.95)]
    let thr = noise + max(0.25 * (peak - noise), 0.4)
    // moving = above threshold for 2 consecutive frames (ignores single-frame flicker/compression noise)
    var moving = diffs.map { $0 > thr }
    for i in 0..<moving.count where moving[i] {
        let prevOK = i > 0 && diffs[i - 1] > thr
        let nextOK = i + 1 < diffs.count && diffs[i + 1] > thr
        if !prevOK && !nextOK { moving[i] = false }
    }
    guard let first = moving.firstIndex(of: true), let last = moving.lastIndex(of: true) else {
        return ["file": path, "duration": duration, "start": 0, "end": duration]
    }
    if ProcessInfo.processInfo.environment["MOTION_DEBUG"] != nil {
        let bars = " ▁▂▃▄▅▆▇█"
        let m = max(sorted.last!, 0.001)
        let line = diffs.map { d -> Character in Array(bars)[min(8, Int(d / m * 8))] }
        FileHandle.standardError.write("thr=\(thr) noise=\(noise) peak=\(peak)\n\(String(line))\n".data(using: .utf8)!)
    }
    let fps = Double(times.count) / max(times.last! - times.first!, 0.001)
    let start = max(0, times[first] - 0.12)
    let end = min(duration, times[last] + 0.15)
    func r(_ x: Double) -> Double { (x * 100).rounded() / 100 }
    var result: [String: Any] = ["file": path, "duration": r(duration), "start": r(start), "end": r(end), "fps": r(fps)]
    // "hold": the longest still stretch between the first and last movement. For a static handshape
    // (most fingerspelled letters) that's the sign itself, between hands-up and hands-down.
    var bestLen = 0, bestFrom = -1, runFrom = -1
    for i in first...last {
        if !moving[i] { if runFrom < 0 { runFrom = i } } else if runFrom >= 0 {
            if i - runFrom > bestLen { bestLen = i - runFrom; bestFrom = runFrom }
            runFrom = -1
        }
    }
    if bestFrom >= 0 {
        let hs = times[bestFrom], he = times[bestFrom + bestLen - 1]
        if he - hs >= 0.3 { result["hold"] = [r(max(0, hs - 0.1)), r(min(duration, he + 0.1))] }
    }
    return result
}

for path in CommandLine.arguments.dropFirst() {
    let result = analyse(path)
    let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
}
