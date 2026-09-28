// Renders the extension's PNG icons from an SF Symbol.
// Usage: swift scripts/make-icons.swift extension/images
import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "extension/images"
let symbol = "macwindow.on.rectangle"

func render(size: Int, to path: String, background: Bool) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let rect = NSRect(x: 0, y: 0, width: size, height: size)
    var tint = NSColor.black
    if background {
        let radius = CGFloat(size) * 0.22
        NSGradient(starting: NSColor(red: 0.20, green: 0.55, blue: 1.0, alpha: 1),
                   ending: NSColor(red: 0.05, green: 0.30, blue: 0.85, alpha: 1))!
            .draw(in: NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius), angle: -90)
        tint = .white
    }
    let inset = CGFloat(size) * (background ? 0.2 : 0.04)
    let config = NSImage.SymbolConfiguration(pointSize: CGFloat(size), weight: .medium)
        .applying(.init(paletteColors: [tint]))
    let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!.withSymbolConfiguration(config)!
    let box = rect.insetBy(dx: inset, dy: inset)
    let scale = min(box.width / image.size.width, box.height / image.size.height)
    let drawSize = NSSize(width: image.size.width * scale, height: image.size.height * scale)
    image.draw(in: NSRect(x: box.midX - drawSize.width / 2, y: box.midY - drawSize.height / 2,
                          width: drawSize.width, height: drawSize.height))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

for size in [48, 96, 128, 256, 512] {
    render(size: size, to: "\(outDir)/icon-\(size).png", background: true)
}
for size in [16, 19, 32, 38] {
    render(size: size, to: "\(outDir)/toolbar-icon-\(size).png", background: false)
}
