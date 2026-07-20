# LiQi UI Backgrounds & Avatars

Bộ asset được đặt tên theo vai trò để có thể đưa trực tiếp vào code.

## Danh sách asset

### `background_ui_tim_tri_ki_hero_1536x1024.png`

- Vai trò: Background hero cho mục Tìm Tri Kỉ / Auto Match trên Trang chủ
- Kích thước: 1536 × 1024 px
- Tỷ lệ: 1.5
- Gợi ý sử dụng: Khung ngang lớn, crop khoảng 3:2; chừa vùng tối bên trái để đặt tiêu đề và CTA.

### `background_ui_phong_cua_ban_1391x1131.png`

- Vai trò: Background card Phòng của bạn
- Kích thước: 1391 × 1131 px
- Tỷ lệ: 1.2299
- Gợi ý sử dụng: Card gần vuông, crop khoảng 5:4; phù hợp đặt avatar đôi và nhãn phòng.

### `background_ui_buoi_choi_sap_toi_1391x1131.png`

- Vai trò: Background card Buổi chơi sắp tới
- Kích thước: 1391 × 1131 px
- Tỷ lệ: 1.2299
- Gợi ý sử dụng: Card gần vuông, crop khoảng 5:4; đặt thông tin giờ, mode và trạng thái sẵn sàng.

### `background_ui_hoat_dong_chien_thang_1064x1478.png`

- Vai trò: Ảnh hoạt động gần đây: Chiến thắng / MVP
- Kích thước: 1064 × 1478 px
- Tỷ lệ: 0.7199
- Gợi ý sử dụng: Thumbnail dọc khoảng 0.72:1; crop trung tâm huy hiệu.

### `background_ui_hoat_dong_ganh_team_1064x1478.png`

- Vai trò: Ảnh hoạt động gần đây: Gánh team
- Kích thước: 1064 × 1478 px
- Tỷ lệ: 0.7199
- Gợi ý sử dụng: Thumbnail dọc khoảng 0.72:1; crop nhân vật chính ở trung tâm.

### `background_ui_hoat_dong_chuoi_4_win_1064x1478.png`

- Vai trò: Ảnh hoạt động gần đây: Chuỗi 4 win
- Kích thước: 1064 × 1478 px
- Tỷ lệ: 0.7199
- Gợi ý sử dụng: Thumbnail dọc khoảng 0.72:1; giữ đường chuyển động đỏ/tím.

### `background_ui_hoat_dong_chill_cung_nhau_1064x1478.png`

- Vai trò: Ảnh hoạt động gần đây: Buổi tối chill cùng nhau
- Kích thước: 1064 × 1478 px
- Tỷ lệ: 0.7199
- Gợi ý sử dụng: Thumbnail dọc khoảng 0.72:1; giữ cặp đôi và trăng ở trung tâm.

### `avatar_ui_nu_tri_ki_1254x1254.png`

- Vai trò: Avatar nữ dùng cho cặp Tri Kỉ / Phòng đôi
- Kích thước: 1254 × 1254 px
- Tỷ lệ: 1.0
- Gợi ý sử dụng: Ảnh vuông 1:1; crop hình tròn, giữ khuôn mặt lệch nhẹ sang trái.

### `avatar_ui_nam_tri_ki_1254x1254.png`

- Vai trò: Avatar nam dùng cho cặp Tri Kỉ / Phòng đôi
- Kích thước: 1254 × 1254 px
- Tỷ lệ: 1.0
- Gợi ý sử dụng: Ảnh vuông 1:1; crop hình tròn, giữ khuôn mặt lệch nhẹ sang phải.

## Gợi ý cấu trúc trong project

```text
src/assets/images/home/
  background_ui_tim_tri_ki_hero_1536x1024.png
  background_ui_phong_cua_ban_1391x1131.png
  background_ui_buoi_choi_sap_toi_1391x1131.png
  background_ui_hoat_dong_chien_thang_1064x1478.png
  background_ui_hoat_dong_ganh_team_1064x1478.png
  background_ui_hoat_dong_chuoi_4_win_1064x1478.png
  background_ui_hoat_dong_chill_cung_nhau_1064x1478.png
src/assets/images/avatars/
  avatar_ui_nu_tri_ki_1254x1254.png
  avatar_ui_nam_tri_ki_1254x1254.png
```

## Lưu ý UI

- Dùng `cover` cho background card để giữ bố cục giàu hình ảnh.
- Nên thêm overlay gradient tối phía đặt chữ để đảm bảo độ tương phản.
- Avatar nên được crop tròn ở runtime thay vì sửa trực tiếp file gốc.
- Có thể tạo thêm bản WebP/AVIF ở pipeline asset của project khi chuẩn bị production.
