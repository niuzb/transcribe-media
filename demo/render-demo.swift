import AppKit
import AVFoundation
import CoreVideo
import Foundation

// From the repository root:
// xcrun swiftc -O -swift-version 5 demo/render-demo.swift \
//   -o /tmp/transcribe-media-render-demo \
//   -framework AppKit -framework AVFoundation -framework CoreVideo
// /tmp/transcribe-media-render-demo "$PWD/demo"

let canvasWidth = 1280
let canvasHeight = 720
let framesPerSecond: Int32 = 30
let durationSeconds = 30.0

struct Palette {
  static let background = NSColor(calibratedRed: 0.027, green: 0.055, blue: 0.102, alpha: 1)
  static let panel = NSColor(calibratedRed: 0.055, green: 0.090, blue: 0.153, alpha: 1)
  static let panelLight = NSColor(calibratedRed: 0.078, green: 0.125, blue: 0.208, alpha: 1)
  static let cyan = NSColor(calibratedRed: 0.133, green: 0.827, blue: 0.761, alpha: 1)
  static let purple = NSColor(calibratedRed: 0.545, green: 0.361, blue: 0.965, alpha: 1)
  static let blue = NSColor(calibratedRed: 0.231, green: 0.510, blue: 0.965, alpha: 1)
  static let green = NSColor(calibratedRed: 0.251, green: 0.835, blue: 0.557, alpha: 1)
  static let amber = NSColor(calibratedRed: 0.980, green: 0.718, blue: 0.263, alpha: 1)
  static let white = NSColor(calibratedWhite: 0.965, alpha: 1)
  static let muted = NSColor(calibratedRed: 0.620, green: 0.690, blue: 0.790, alpha: 1)
  static let line = NSColor(calibratedRed: 0.150, green: 0.220, blue: 0.330, alpha: 1)
}

func clamp(_ value: Double, _ lower: Double = 0, _ upper: Double = 1) -> Double {
  min(max(value, lower), upper)
}

func easeOut(_ value: Double) -> Double {
  1 - pow(1 - clamp(value), 3)
}

func smooth(_ value: Double) -> Double {
  let x = clamp(value)
  return x * x * (3 - 2 * x)
}

func lerp(_ start: CGFloat, _ end: CGFloat, _ progress: Double) -> CGFloat {
  start + (end - start) * CGFloat(progress)
}

func visibility(_ time: Double, start: Double, end: Double, fade: Double = 0.65) -> CGFloat {
  guard time >= start, time <= end else { return 0 }
  if time < start + fade { return CGFloat(smooth((time - start) / fade)) }
  if time > end - fade { return CGFloat(smooth((end - time) / fade)) }
  return 1
}

func font(_ size: CGFloat, weight: NSFont.Weight = .regular, mono: Bool = false) -> NSFont {
  mono
    ? NSFont.monospacedSystemFont(ofSize: size, weight: weight)
    : NSFont.systemFont(ofSize: size, weight: weight)
}

func opacity(_ color: NSColor, _ alpha: CGFloat) -> NSColor {
  color.withAlphaComponent(color.alphaComponent * alpha)
}

func drawText(
  _ text: String,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat? = nil,
  size: CGFloat,
  weight: NSFont.Weight = .regular,
  color: NSColor = Palette.white,
  alpha: CGFloat = 1,
  alignment: NSTextAlignment = .left,
  mono: Bool = false,
  lineHeight: CGFloat? = nil
) {
  guard alpha > 0 else { return }
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = alignment
  paragraph.lineBreakMode = .byWordWrapping
  paragraph.minimumLineHeight = lineHeight ?? size * 1.25
  paragraph.maximumLineHeight = lineHeight ?? size * 1.25
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font(size, weight: weight, mono: mono),
    .foregroundColor: opacity(color, alpha),
    .paragraphStyle: paragraph,
  ]
  let value = text as NSString
  if let width {
    value.draw(in: NSRect(x: x, y: y, width: width, height: 220), withAttributes: attributes)
  } else {
    value.draw(at: NSPoint(x: x, y: y), withAttributes: attributes)
  }
}

func roundedRect(
  _ rect: NSRect,
  radius: CGFloat,
  color: NSColor,
  alpha: CGFloat = 1,
  border: NSColor? = nil,
  borderWidth: CGFloat = 1
) {
  guard alpha > 0 else { return }
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  opacity(color, alpha).setFill()
  path.fill()
  if let border {
    opacity(border, alpha).setStroke()
    path.lineWidth = borderWidth
    path.stroke()
  }
}

func circle(center: NSPoint, radius: CGFloat, color: NSColor, alpha: CGFloat = 1) {
  opacity(color, alpha).setFill()
  NSBezierPath(ovalIn: NSRect(
    x: center.x - radius,
    y: center.y - radius,
    width: radius * 2,
    height: radius * 2
  )).fill()
}

func line(from: NSPoint, to: NSPoint, color: NSColor, width: CGFloat = 2, alpha: CGFloat = 1) {
  guard alpha > 0 else { return }
  let path = NSBezierPath()
  path.move(to: from)
  path.line(to: to)
  path.lineWidth = width
  path.lineCapStyle = .round
  opacity(color, alpha).setStroke()
  path.stroke()
}

func pill(_ text: String, x: CGFloat, y: CGFloat, color: NSColor, alpha: CGFloat = 1, width: CGFloat? = nil) {
  let resolvedWidth = width ?? CGFloat(text.count) * 8.2 + 28
  roundedRect(
    NSRect(x: x, y: y, width: resolvedWidth, height: 34),
    radius: 17,
    color: color.withAlphaComponent(0.14),
    alpha: alpha,
    border: color.withAlphaComponent(0.55)
  )
  drawText(text.uppercased(), x: x, y: y + 7, width: resolvedWidth, size: 12, weight: .semibold,
           color: color, alpha: alpha, alignment: .center)
}

func drawLogo(x: CGFloat, y: CGFloat, scale: CGFloat = 1, alpha: CGFloat = 1) {
  let radius = 26 * scale
  circle(center: NSPoint(x: x + radius, y: y + radius), radius: radius, color: Palette.cyan, alpha: alpha)
  let barWidth = 4 * scale
  let gap = 5 * scale
  let heights: [CGFloat] = [14, 25, 34, 23, 14]
  for (index, height) in heights.enumerated() {
    roundedRect(
      NSRect(
        x: x + 12 * scale + CGFloat(index) * (barWidth + gap),
        y: y + radius - height * scale / 2,
        width: barWidth,
        height: height * scale
      ),
      radius: barWidth / 2,
      color: Palette.background,
      alpha: alpha
    )
  }
}

func drawChrome(alpha: CGFloat) {
  drawLogo(x: 42, y: 31, scale: 0.62, alpha: alpha)
  drawText("TRANSCRIBE MEDIA", x: 86, y: 43, size: 15, weight: .bold, color: Palette.white, alpha: alpha)
  drawText("CAPTIONS FIRST · ASR WHEN NEEDED", x: 1045, y: 44, width: 190, size: 10,
           weight: .semibold, color: Palette.muted, alpha: alpha, alignment: .right)
}

func drawBackground(time: Double) {
  Palette.background.setFill()
  NSBezierPath(rect: NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)).fill()

  let drift = CGFloat(sin(time * 0.35))
  circle(center: NSPoint(x: 1020 + drift * 45, y: 120), radius: 230, color: Palette.purple, alpha: 0.055)
  circle(center: NSPoint(x: 190 - drift * 35, y: 610), radius: 260, color: Palette.cyan, alpha: 0.045)

  for row in 0..<8 {
    for column in 0..<15 {
      circle(
        center: NSPoint(x: 36 + CGFloat(column) * 88, y: 92 + CGFloat(row) * 82),
        radius: 1.1,
        color: Palette.line,
        alpha: 0.22
      )
    }
  }
  drawChrome(alpha: 0.95)
}

func drawSceneOne(time: Double, alpha: CGFloat) {
  let local = easeOut((time - 0.15) / 1.2)
  let rise = lerp(36, 0, local)
  pill("30-second demo", x: 540, y: 150 + rise, color: Palette.cyan, alpha: alpha, width: 200)
  drawText("Turn media into text.", x: 120, y: 230 + rise, width: 1040, size: 72, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center, lineHeight: 80)
  drawText(
    "Public videos · Podcasts · Local audio & video",
    x: 160,
    y: 335 + rise,
    width: 960,
    size: 26,
    weight: .medium,
    color: Palette.muted,
    alpha: alpha,
    alignment: .center
  )

  let pillAlpha = alpha * CGFloat(easeOut((time - 1.1) / 0.9))
  pill("Captions first", x: 340, y: 430, color: Palette.green, alpha: pillAlpha, width: 175)
  pill("Consent gated", x: 552, y: 430, color: Palette.amber, alpha: pillAlpha, width: 175)
  pill("Raw transcript", x: 764, y: 430, color: Palette.purple, alpha: pillAlpha, width: 175)

  let progress = clamp((time - 0.5) / 3.6)
  roundedRect(NSRect(x: 320, y: 532, width: 640, height: 5), radius: 2.5, color: Palette.line, alpha: alpha)
  roundedRect(NSRect(x: 320, y: 532, width: 640 * CGFloat(progress), height: 5), radius: 2.5,
              color: Palette.cyan, alpha: alpha)
}

func inputIcon(kind: Int, x: CGFloat, y: CGFloat, color: NSColor, alpha: CGFloat) {
  if kind == 0 {
    roundedRect(NSRect(x: x, y: y, width: 72, height: 47), radius: 8, color: color.withAlphaComponent(0.12),
                alpha: alpha, border: color)
    let triangle = NSBezierPath()
    triangle.move(to: NSPoint(x: x + 31, y: y + 12))
    triangle.line(to: NSPoint(x: x + 31, y: y + 35))
    triangle.line(to: NSPoint(x: x + 50, y: y + 23.5))
    triangle.close()
    color.withAlphaComponent(alpha).setFill()
    triangle.fill()
  } else if kind == 1 {
    circle(center: NSPoint(x: x + 36, y: y + 25), radius: 18, color: color.withAlphaComponent(0.14), alpha: alpha)
    circle(center: NSPoint(x: x + 36, y: y + 25), radius: 7, color: color, alpha: alpha)
    line(from: NSPoint(x: x + 36, y: y + 2), to: NSPoint(x: x + 36, y: y + 48), color: color, width: 3, alpha: alpha)
  } else {
    roundedRect(NSRect(x: x + 5, y: y, width: 62, height: 50), radius: 8, color: color.withAlphaComponent(0.12),
                alpha: alpha, border: color)
    for index in 0..<5 {
      let height = CGFloat([12, 24, 34, 20, 13][index])
      roundedRect(NSRect(x: x + 16 + CGFloat(index) * 9, y: y + 25 - height / 2, width: 4, height: height),
                  radius: 2, color: color, alpha: alpha)
    }
  }
}

func drawInputCard(index: Int, title: String, subtitle: String, color: NSColor, time: Double, alpha: CGFloat) {
  let progress = easeOut((time - 5.0 - Double(index) * 0.18) / 0.75)
  let baseX = CGFloat(105 + index * 365)
  let y = lerp(410, 300, progress)
  let cardAlpha = alpha * CGFloat(progress)
  roundedRect(NSRect(x: baseX, y: y, width: 330, height: 235), radius: 24, color: Palette.panel,
              alpha: cardAlpha, border: color.withAlphaComponent(0.50), borderWidth: 1.2)
  inputIcon(kind: index, x: baseX + 129, y: y + 44, color: color, alpha: cardAlpha)
  drawText(title, x: baseX + 28, y: y + 121, width: 274, size: 25, weight: .bold, color: Palette.white,
           alpha: cardAlpha, alignment: .center)
  drawText(subtitle, x: baseX + 32, y: y + 165, width: 266, size: 15, color: Palette.muted,
           alpha: cardAlpha, alignment: .center, lineHeight: 21)
}

func drawSceneTwo(time: Double, alpha: CGFloat) {
  drawText("One skill. Three kinds of input.", x: 110, y: 115, width: 1060, size: 48, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center)
  drawText("Give your agent a public link or a local file.", x: 170, y: 183, width: 940, size: 21,
           color: Palette.muted, alpha: alpha, alignment: .center)
  drawInputCard(index: 0, title: "Public video", subtitle: "YouTube, Bilibili, TikTok, Vimeo, and more", color: Palette.blue,
                time: time, alpha: alpha)
  drawInputCard(index: 1, title: "Podcast episode", subtitle: "Public single-episode pages, including Xiaoyuzhou", color: Palette.purple,
                time: time, alpha: alpha)
  drawInputCard(index: 2, title: "Local media", subtitle: "FLAC · MP3 · MP4 · WAV · WebM and more", color: Palette.cyan,
                time: time, alpha: alpha)
}

func flowNode(_ title: String, subtitle: String, x: CGFloat, color: NSColor, alpha: CGFloat, emphasized: Bool = false) {
  roundedRect(NSRect(x: x, y: 285, width: 260, height: 150), radius: 22,
              color: emphasized ? color.withAlphaComponent(0.12) : Palette.panel,
              alpha: alpha, border: color.withAlphaComponent(emphasized ? 0.85 : 0.35), borderWidth: emphasized ? 2 : 1)
  drawText(title, x: x + 24, y: 318, width: 212, size: 24, weight: .bold, color: Palette.white,
           alpha: alpha, alignment: .center)
  drawText(subtitle, x: x + 20, y: 365, width: 220, size: 15, color: emphasized ? color : Palette.muted,
           alpha: alpha, alignment: .center, lineHeight: 20)
}

func drawArrow(x1: CGFloat, x2: CGFloat, y: CGFloat, progress: Double, color: NSColor, alpha: CGFloat) {
  let end = lerp(x1, x2, progress)
  line(from: NSPoint(x: x1, y: y), to: NSPoint(x: end, y: y), color: color, width: 3, alpha: alpha)
  if progress > 0.95 {
    line(from: NSPoint(x: x2 - 10, y: y - 8), to: NSPoint(x: x2, y: y), color: color, width: 3, alpha: alpha)
    line(from: NSPoint(x: x2 - 10, y: y + 8), to: NSPoint(x: x2, y: y), color: color, width: 3, alpha: alpha)
  }
}

func drawSceneThree(time: Double, alpha: CGFloat) {
  drawText("Captions first. No wasted transcription.", x: 100, y: 112, width: 1080, size: 46, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center)
  drawText("If usable page text exists, the media never leaves the source.", x: 140, y: 179, width: 1000, size: 21,
           color: Palette.muted, alpha: alpha, alignment: .center)

  flowNode("Public URL", subtitle: "One media item", x: 100, color: Palette.blue, alpha: alpha)
  flowNode("Check captions", subtitle: "Manual or automatic", x: 510, color: Palette.purple, alpha: alpha)
  flowNode("Return text", subtitle: "No media upload", x: 920, color: Palette.green, alpha: alpha, emphasized: true)

  let first = easeOut((time - 10.4) / 0.8)
  let second = easeOut((time - 11.3) / 0.8)
  drawArrow(x1: 370, x2: 500, y: 360, progress: first, color: Palette.cyan, alpha: alpha)
  drawArrow(x1: 780, x2: 910, y: 360, progress: second, color: Palette.green, alpha: alpha)

  let checkAlpha = alpha * CGFloat(easeOut((time - 12.0) / 0.6))
  circle(center: NSPoint(x: 1050, y: 510), radius: 18, color: Palette.green, alpha: checkAlpha)
  drawText("✓", x: 1039, y: 496, width: 22, size: 20, weight: .bold, color: Palette.background,
           alpha: checkAlpha, alignment: .center)
  drawText("Fast path complete", x: 1078, y: 497, size: 17, weight: .semibold, color: Palette.green, alpha: checkAlpha)
}

func terminalLine(_ text: String, x: CGFloat, y: CGFloat, color: NSColor, reveal: Double, alpha: CGFloat) {
  let lineAlpha = alpha * CGFloat(easeOut(reveal))
  drawText(text, x: x, y: y, size: 16, weight: .medium, color: color, alpha: lineAlpha, mono: true)
}

func statusBadge(_ text: String, x: CGFloat, y: CGFloat, color: NSColor, alpha: CGFloat) {
  roundedRect(NSRect(x: x, y: y, width: 355, height: 54), radius: 15, color: Palette.panel, alpha: alpha,
              border: color.withAlphaComponent(0.45))
  circle(center: NSPoint(x: x + 28, y: y + 27), radius: 8, color: color, alpha: alpha)
  drawText(text, x: x + 50, y: y + 17, width: 285, size: 16, weight: .semibold, color: Palette.white, alpha: alpha)
}

func drawSceneFour(time: Double, alpha: CGFloat) {
  drawText("No captions? ASR continues—with consent.", x: 80, y: 95, width: 1120, size: 43, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center)

  roundedRect(NSRect(x: 70, y: 175, width: 665, height: 410), radius: 24, color: Palette.panel,
              alpha: alpha, border: Palette.line)
  roundedRect(NSRect(x: 70, y: 175, width: 665, height: 48), radius: 24, color: Palette.panelLight, alpha: alpha)
  circle(center: NSPoint(x: 99, y: 199), radius: 6, color: NSColor.systemRed, alpha: alpha)
  circle(center: NSPoint(x: 119, y: 199), radius: 6, color: NSColor.systemYellow, alpha: alpha)
  circle(center: NSPoint(x: 139, y: 199), radius: 6, color: NSColor.systemGreen, alpha: alpha)
  drawText("agent session", x: 535, y: 190, width: 165, size: 12, weight: .medium, color: Palette.muted,
           alpha: alpha, alignment: .right, mono: true)

  terminalLine("> Use $transcribe-media to transcribe", x: 101, y: 248, color: Palette.white,
               reveal: (time - 15.3) / 0.35, alpha: alpha)
  terminalLine("  this public podcast episode.", x: 101, y: 276, color: Palette.white,
               reveal: (time - 15.55) / 0.35, alpha: alpha)
  terminalLine("Checking captions…", x: 101, y: 327, color: Palette.cyan,
               reveal: (time - 16.0) / 0.35, alpha: alpha)
  terminalLine("No usable captions found.", x: 101, y: 363, color: Palette.muted,
               reveal: (time - 16.6) / 0.35, alpha: alpha)
  terminalLine("Remote ASR requires approval.", x: 101, y: 414, color: Palette.amber,
               reveal: (time - 17.1) / 0.35, alpha: alpha)
  terminalLine("✓ Approved for this run", x: 101, y: 462, color: Palette.green,
               reveal: (time - 17.9) / 0.35, alpha: alpha)
  terminalLine("Transcribing with VoiceFlow…", x: 101, y: 513, color: Palette.purple,
               reveal: (time - 18.5) / 0.35, alpha: alpha)

  let badgeOne = alpha * CGFloat(easeOut((time - 16.2) / 0.6))
  let badgeTwo = alpha * CGFloat(easeOut((time - 17.2) / 0.6))
  let badgeThree = alpha * CGFloat(easeOut((time - 19.0) / 0.6))
  statusBadge("Explicit approval before upload", x: 815, y: 246, color: Palette.amber, alpha: badgeOne)
  statusBadge("HTTPS upload to private storage", x: 815, y: 330, color: Palette.blue, alpha: badgeTwo)
  statusBadge("Uploaded media deleted at result", x: 815, y: 414, color: Palette.green, alpha: badgeThree)
  drawText("Private lifecycle fallback: 2–3 days", x: 840, y: 491, width: 305, size: 13,
           color: Palette.muted, alpha: badgeThree, alignment: .center)
}

func drawSceneFive(time: Double, alpha: CGFloat) {
  drawText("A clean, source-faithful transcript.", x: 80, y: 92, width: 1120, size: 46, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center)
  roundedRect(NSRect(x: 85, y: 180, width: 790, height: 430), radius: 24, color: Palette.panel,
              alpha: alpha, border: Palette.line)
  drawText("TRANSCRIPT", x: 120, y: 215, size: 13, weight: .bold, color: Palette.cyan, alpha: alpha)
  pill("RAW OUTPUT", x: 698, y: 205, color: Palette.purple, alpha: alpha, width: 140)

  let reveal = clamp((time - 22.0) / 2.5)
  let lines = [
    ("00:00", "Welcome back. Today we're turning a long podcast", Palette.cyan),
    ("00:05", "into a searchable, source-faithful transcript.", Palette.cyan),
    ("00:11", "Captions are checked first, so existing text is", Palette.purple),
    ("00:16", "returned without uploading the media.", Palette.purple),
    ("00:22", "When ASR is needed, approval comes before upload.", Palette.green),
  ]
  for (index, entry) in lines.enumerated() {
    let lineProgress = easeOut((reveal * Double(lines.count) - Double(index)) / 0.8)
    let lineAlpha = alpha * CGFloat(lineProgress)
    let y = CGFloat(275 + index * 57)
    drawText(entry.0, x: 120, y: y, width: 80, size: 14, weight: .semibold, color: entry.2,
             alpha: lineAlpha, mono: true)
    drawText(entry.1, x: 205, y: y - 2, width: 620, size: 17, weight: .medium, color: Palette.white,
             alpha: lineAlpha)
  }

  statusBadge("Temporary local media removed", x: 920, y: 235, color: Palette.cyan, alpha: alpha)
  statusBadge("Uploaded media deleted", x: 920, y: 325, color: Palette.green, alpha: alpha)
  statusBadge("No rewriting by default", x: 920, y: 415, color: Palette.purple, alpha: alpha)
}

func drawSceneSix(time: Double, alpha: CGFloat) {
  let progress = easeOut((time - 26.55) / 0.9)
  let rise = lerp(30, 0, progress)
  drawLogo(x: 594, y: 112 + rise, scale: 1.75, alpha: alpha)
  drawText("Install Transcribe Media", x: 140, y: 240 + rise, width: 1000, size: 51, weight: .bold,
           color: Palette.white, alpha: alpha, alignment: .center)
  drawText("One skill for videos, podcasts, and local media.", x: 170, y: 309 + rise, width: 940, size: 21,
           color: Palette.muted, alpha: alpha, alignment: .center)

  roundedRect(NSRect(x: 230, y: 380 + rise, width: 820, height: 76), radius: 18, color: Palette.panel,
              alpha: alpha, border: Palette.cyan.withAlphaComponent(0.5))
  drawText("$", x: 266, y: 403 + rise, size: 20, weight: .bold, color: Palette.cyan, alpha: alpha, mono: true)
  drawText("openclaw skills install @niuzb/transcribe-media", x: 300, y: 402 + rise, size: 19,
           weight: .semibold, color: Palette.white, alpha: alpha, mono: true)

  pill("Creative", x: 375, y: 497 + rise, color: Palette.purple, alpha: alpha, width: 125)
  pill("Productivity", x: 518, y: 497 + rise, color: Palette.blue, alpha: alpha, width: 150)
  pill("Security: Pass", x: 686, y: 497 + rise, color: Palette.green, alpha: alpha, width: 165)
  drawText("clawhub.ai/niuzb/skills/transcribe-media", x: 250, y: 570 + rise, width: 780, size: 18,
           weight: .semibold, color: Palette.cyan, alpha: alpha, alignment: .center)
  drawText("#transcription  #audio  #video  #podcast  #subtitles", x: 250, y: 608 + rise, width: 780,
           size: 13, weight: .medium, color: Palette.muted, alpha: alpha, alignment: .center, mono: true)
}

func drawFrame(time: Double, context: CGContext) {
  context.saveGState()
  context.translateBy(x: 0, y: CGFloat(canvasHeight))
  context.scaleBy(x: 1, y: -1)
  defer { context.restoreGState() }
  let graphicsContext = NSGraphicsContext(cgContext: context, flipped: true)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = graphicsContext
  drawBackground(time: time)

  let sceneOne = visibility(time, start: 0, end: 5.15)
  let sceneTwo = visibility(time, start: 4.55, end: 10.20)
  let sceneThree = visibility(time, start: 9.60, end: 15.35)
  let sceneFour = visibility(time, start: 14.75, end: 22.15)
  let sceneFive = visibility(time, start: 21.55, end: 27.20)
  let sceneSix = time >= 26.55 ? CGFloat(smooth((time - 26.55) / 0.65)) : 0

  if sceneOne > 0 { drawSceneOne(time: time, alpha: sceneOne) }
  if sceneTwo > 0 { drawSceneTwo(time: time, alpha: sceneTwo) }
  if sceneThree > 0 { drawSceneThree(time: time, alpha: sceneThree) }
  if sceneFour > 0 { drawSceneFour(time: time, alpha: sceneFour) }
  if sceneFive > 0 { drawSceneFive(time: time, alpha: sceneFive) }
  if sceneSix > 0 { drawSceneSix(time: time, alpha: sceneSix) }

  let totalProgress = CGFloat(time / durationSeconds)
  roundedRect(NSRect(x: 0, y: 710, width: 1280, height: 10), radius: 0, color: Palette.panelLight, alpha: 0.8)
  roundedRect(NSRect(x: 0, y: 710, width: 1280 * totalProgress, height: 10), radius: 0, color: Palette.cyan, alpha: 0.9)
  NSGraphicsContext.restoreGraphicsState()
}

func makePixelBuffer(pool: CVPixelBufferPool) throws -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
  guard status == kCVReturnSuccess, let buffer else {
    throw NSError(domain: "TranscribeMediaDemo", code: Int(status), userInfo: [
      NSLocalizedDescriptionKey: "Could not create a video frame.",
    ])
  }
  return buffer
}

func renderFrame(into pixelBuffer: CVPixelBuffer, time: Double) throws -> CGImage {
  CVPixelBufferLockBaseAddress(pixelBuffer, [])
  defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
  guard
    let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer),
    let context = CGContext(
      data: baseAddress,
      width: canvasWidth,
      height: canvasHeight,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    )
  else {
    throw NSError(domain: "TranscribeMediaDemo", code: 2, userInfo: [
      NSLocalizedDescriptionKey: "Could not create a drawing canvas.",
    ])
  }
  drawFrame(time: time, context: context)
  guard let image = context.makeImage() else {
    throw NSError(domain: "TranscribeMediaDemo", code: 3, userInfo: [
      NSLocalizedDescriptionKey: "Could not capture the rendered frame.",
    ])
  }
  return image
}

let demoDirectory = CommandLine.arguments.count > 1
  ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true).standardizedFileURL
  : URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
      .appendingPathComponent("demo", isDirectory: true)
try FileManager.default.createDirectory(at: demoDirectory, withIntermediateDirectories: true)
let outputURL = demoDirectory.appendingPathComponent("transcribe-media-demo.mp4")
let posterURL = demoDirectory.appendingPathComponent("transcribe-media-demo-poster.png")
try? FileManager.default.removeItem(at: outputURL)
try? FileManager.default.removeItem(at: posterURL)

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let outputSettings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: canvasWidth,
  AVVideoHeightKey: canvasHeight,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 3_500_000,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel,
  ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: canvasWidth,
    kCVPixelBufferHeightKey as String: canvasHeight,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
  ]
)
guard writer.canAdd(input) else {
  throw NSError(domain: "TranscribeMediaDemo", code: 4, userInfo: [
    NSLocalizedDescriptionKey: "The video writer rejected its input settings.",
  ])
}
writer.add(input)
guard writer.startWriting() else {
  throw writer.error ?? NSError(domain: "TranscribeMediaDemo", code: 5)
}
writer.startSession(atSourceTime: .zero)
guard let pool = adaptor.pixelBufferPool else {
  throw NSError(domain: "TranscribeMediaDemo", code: 6, userInfo: [
    NSLocalizedDescriptionKey: "The video writer did not create a frame pool.",
  ])
}

let totalFrames = Int(durationSeconds * Double(framesPerSecond))
let posterFrame = Int(28.4 * Double(framesPerSecond))
for frame in 0..<totalFrames {
  while !input.isReadyForMoreMediaData {
    Thread.sleep(forTimeInterval: 0.002)
  }
  let pixelBuffer = try makePixelBuffer(pool: pool)
  let time = Double(frame) / Double(framesPerSecond)
  let image = try renderFrame(into: pixelBuffer, time: time)
  let presentationTime = CMTime(value: CMTimeValue(frame), timescale: framesPerSecond)
  guard adaptor.append(pixelBuffer, withPresentationTime: presentationTime) else {
    throw writer.error ?? NSError(domain: "TranscribeMediaDemo", code: 7)
  }
  if frame == posterFrame {
    let representation = NSBitmapImageRep(cgImage: image)
    guard let data = representation.representation(using: .png, properties: [:]) else {
      throw NSError(domain: "TranscribeMediaDemo", code: 8)
    }
    try data.write(to: posterURL, options: .atomic)
  }
  if frame % 90 == 0 {
    let percent = Int((Double(frame) / Double(totalFrames)) * 100)
    FileHandle.standardError.write(Data("Rendering \(percent)%\n".utf8))
  }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()
guard writer.status == .completed else {
  throw writer.error ?? NSError(domain: "TranscribeMediaDemo", code: 9)
}

print(outputURL.path)
print(posterURL.path)
