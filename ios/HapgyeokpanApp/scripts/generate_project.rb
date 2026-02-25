#!/usr/bin/env ruby
require 'xcodeproj'
require 'fileutils'

root = File.expand_path('..', __dir__)
project_path = File.join(root, 'HapgyeokpanApp.xcodeproj')
app_dir = File.join(root, 'HapgyeokpanApp')

FileUtils.rm_rf(project_path) if File.exist?(project_path)

project = Xcodeproj::Project.new(project_path)
project.root_object.attributes['LastSwiftUpdateCheck'] = '1620'
project.root_object.attributes['LastUpgradeCheck'] = '1620'

app_target = project.new_target(:application, 'HapgyeokpanApp', :ios, '16.0')

main_group = project.main_group
sources_group = main_group.new_group('HapgyeokpanApp', app_dir)

core_group = sources_group.new_group('Core', File.join(app_dir, 'Core'))
features_group = sources_group.new_group('Features', File.join(app_dir, 'Features'))
resources_group = sources_group.new_group('Resources', File.join(app_dir, 'Resources'))

feature_subgroups = {
  'Transfer' => features_group.new_group('Transfer', File.join(app_dir, 'Features/Transfer')),
  'Community' => features_group.new_group('Community', File.join(app_dir, 'Features/Community')),
  'Ranking' => features_group.new_group('Ranking', File.join(app_dir, 'Features/Ranking')),
  'Timer' => features_group.new_group('Timer', File.join(app_dir, 'Features/Timer')),
  'MyPage' => features_group.new_group('MyPage', File.join(app_dir, 'Features/MyPage')),
  'Verification' => features_group.new_group('Verification', File.join(app_dir, 'Features/Verification')),
  'Admin' => features_group.new_group('Admin', File.join(app_dir, 'Features/Admin')),
}

source_files = [
  'HapgyeokpanApp.swift',
  'ContentView.swift',
  'Core/AppConfig.swift',
  'Core/Models.swift',
  'Core/SessionStore.swift',
  'Core/OAuthCoordinator.swift',
  'Core/APIClient.swift',
  'Features/Transfer/TransferHomeView.swift',
  'Features/Community/CommunityBoardsView.swift',
  'Features/Community/BoardPostsView.swift',
  'Features/Community/PostComposerView.swift',
  'Features/Community/PostDetailView.swift',
  'Features/Ranking/RankingView.swift',
  'Features/Timer/TimerView.swift',
  'Features/MyPage/MyPageView.swift',
  'Features/Verification/VerificationView.swift',
  'Features/Admin/AdminView.swift',
]

source_files.each do |relative_path|
  file_path = File.join(app_dir, relative_path)
  group = if relative_path.start_with?('Core/')
    core_group
  elsif relative_path.start_with?('Features/')
    section = relative_path.split('/')[1]
    feature_subgroups[section] || features_group
  else
    sources_group
  end

  ref = group.new_file(file_path)
  app_target.add_file_references([ref])
end

plist_path = File.join(app_dir, 'Resources/Info.plist')
resources_group.new_file(plist_path)

app_target.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = 'HapgyeokpanApp/Resources/Info.plist'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'kr.hapgyeokpan.ios'
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['DEVELOPMENT_TEAM'] = ''
end

project.save
puts "Generated: #{project_path}"
