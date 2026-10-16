// Turn a sign video into a single contact-sheet PNG (evenly spaced frames in a grid)
// so Claude can look at how a sign is actually made before describing it.
//
// Usage: swift tools/framesheet.swift <video.mp4 | https://…mp4> <out.png> [frames=8] [columns=4]
// macOS only (AVFoundation). No dependencies.
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: framesheet <video> <out.png> [frames] [columns]\n".data(using: .utf8)!)
    exit(1)
}
let src = args[1]
let out = URL(fileURLWithPath: args[2])
let count = args.count > 3 ? Int(args[3]) ?? 8 : 8
let cols = args.count > 4 ? Int(args[4]) ?? 4 : 4

let url = src.hasPrefix("http") ? URL(string: src)! : URL(fileURLWithPath: src)
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
gen.maximumSize = CGSize(width: 360, height: 360)

let sem = DispatchSemaphore(value: 0)
var duration = 0.0
Task {
    duration = (try? await asset.load(.duration).seconds) ?? 0
    sem.signal()
}
sem.wait()
guard duration > 0 else {
    FileHandle.standardError.write("could not read video duration\n".data(using: .utf8)!)
    exit(2)
}

var frames: [(Double, CGImage)] = []
for i in 0..<count {
    // Skip the very first/last instants, which are usually a still pose.
    let t = duration * (Double(i) + 0.5) / Double(count)
    if let img = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
        frames.append((t, img))
    }
}
guard let first = frames.first?.1 else { exit(3) }

let fw = first.width, fh = first.height, label = 22
let rows = (frames.count + cols - 1) / cols
let W = fw * cols, H = (fh + label) * rows
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
for (i, (t, img)) in frames.enumerated() {
    let col = i % cols, row = i / cols
    let x = col * fw
    let y = H - (row + 1) * (fh + label)  // CG origin is bottom-left
    ctx.draw(img, in: CGRect(x: x, y: y, width: fw, height: fh))
    let text = String(format: "%d  %.2fs", i + 1, t) as NSString
    text.draw(at: NSPoint(x: x + 6, y: y + fh + 3),
              withAttributes: [.font: NSFont.systemFont(ofSize: 14, weight: .semibold),
                               .foregroundColor: NSColor.black])
}

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: out)
print(out.path, "\(frames.count) frames, \(String(format: "%.2f", duration))s")
