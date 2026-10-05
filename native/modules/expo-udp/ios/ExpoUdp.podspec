Pod::Spec.new do |s|
  s.name           = 'ExpoUdp'
  s.version        = '0.1.0'
  s.summary        = 'UDP sockets for the BombSquad LAN protocol'
  s.description    = 'UDP sockets for the BombSquad LAN protocol'
  s.author         = 'SquadPad'
  s.homepage       = 'https://squadpad.org'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.swift"
end
