# 机械蜂原图与透明蒙版

`web/bee-source.png` 是用户提供的“悬浮霓虹机械蜂虎机.png”的原始字节副本。原文件保持不变。

`web/bee-alpha.png` 由内置 image_gen 工具提取背景，用作透明蒙版。程序仅读取其 alpha 通道，完全不显示生成图的 RGB；主体颜色与表面纹理由原图提供。`web/bee-art.js` 在运行时组装原图部件，旧版矢量替代造型已移除。

默认以原图左向为基准，向右飞行只做水平镜像，保留已保存的方向设置。

## 蒙版提取提示词

Use case: background-extraction. Edit target: the supplied mechanical bee image. This is NOT a redesign and NOT a reference for a new drawing. Primary request: remove ONLY the baked-in white/light-gray checkerboard background and replace it with genuine transparent alpha. Preserve the ENTIRE mechanical bee EXACTLY as supplied: identical silhouette, pose, orientation facing left, both wings, two eyes, antennae, silver/black armor plates, cyan-blue highlights, curved mouthpart, claws, rear stinger, every texture and reflection. Preserve original framing and proportions, do not crop any wing tips. Keep all original object pixels and fine blue glow edges wherever possible. No added details, no simplified shapes, no restyling, no changed anatomy, no alternative character. Output a transparent PNG cutout of this exact original bee, ideally original 1536x1024 canvas. Do not draw a checkerboard into the result.
