# LIQI message avatar assets

Các avatar Messages không còn được lưu thành bản sao riêng trong thư mục này.
Runtime resolve avatar bằng `AssetKey` từ manifest canonical tại
`assets/simulation/asset-manifest.v1.json`; file WebP vật lý nằm trong
`assets/simulation/golden-world/avatars/`.

## Mapping canonical

- Pink support: `asset:profile:trang-carry:avatar`
- Silver assassin: `asset:profile:duc-flex:avatar`
- Lavender mage: `asset:profile:an-mage:avatar`
- Dark fighter: `asset:profile:huy-captain:avatar`
- Cyber girl: `asset:profile:linh-mid:avatar`
- Pink carry: `asset:profile:vy-carry:avatar`
- Ice prince: `asset:profile:nam-slayer:avatar`
- Cozy gamer: `asset:profile:quan-viewer:avatar`

Không thêm lại bản sao PNG theo feature. Khi cần asset mới, cập nhật manifest và chạy
`npm run assets:generate`, sau đó xác minh bằng `npm run assets:check`.
