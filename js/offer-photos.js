// @ts-check
// Photos of offered items (supabase/migrations/20261102120000_offer_photos.sql): 1–3 per offer, in the
// PRIVATE storage bucket "offer-photos", in a folder named after the donor. Only the donor, the
// organization that received the offer and admins can see them (the database decides).
// Every photo is re-drawn on a canvas before upload, which removes hidden data such as the location
// (EXIF). Never logs anything about the photos.

const OFFER_PHOTO_BUCKET = "offer-photos";
const MAX_OFFER_PHOTOS = 3;
const PHOTO_MAX_SIDE = 1600;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A photo the donor picked, ready to upload: a clean JPEG plus a preview address for the page.
 * @typedef {{ key: number, blob: Blob, preview: string }} PreparedPhoto
 */

let photoKey = 0;

/**
 * Turns a picked file into a clean JPEG (at most 1600 px, no EXIF / location data).
 * Throws an Error with a friendly message for a wrong type or a file that can't be read.
 * @param {File} file
 * @returns {Promise<PreparedPhoto>}
 */
async function preparePhoto(file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error(t("photos.errType"));
  /** @type {ImageBitmap} */
  let bitmap;
  try {
    // "from-image" keeps phone photos the right way up once the EXIF data is gone
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(t("photos.errRead"));
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("photos.errRead"));
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!(blob instanceof Blob)) throw new Error(t("photos.errRead"));
  if (blob.size > PHOTO_MAX_BYTES) throw new Error(t("photos.errSize"));
  return { key: ++photoKey, blob, preview: URL.createObjectURL(blob) };
}

/**
 * Uploads the donor's photos to their own folder and returns the storage paths for the offer.
 * If one upload fails, the ones already uploaded are removed again.
 * @param {PreparedPhoto[]} photos
 * @returns {Promise<string[]>}
 */
async function uploadOfferPhotos(photos) {
  const { data } = await db().auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw { code: "42501", message: "Not logged in" }; // i18n-ignore (shown via friendlyError by its code)
  const folder = `${userId}/${crypto.randomUUID()}`;
  /** @type {string[]} */
  const paths = [];
  try {
    for (const [index, photo] of photos.slice(0, MAX_OFFER_PHOTOS).entries()) {
      const path = `${folder}/${index + 1}.jpg`;
      const { error } = await db().storage.from(OFFER_PHOTO_BUCKET).upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      paths.push(path);
    }
  } catch (error) {
    await removeUnusedPhotos(paths);
    throw error;
  }
  return paths;
}

/**
 * Removes photos that no offer uses (after sending failed). Errors are ignored: the database only
 * lets donors delete their own unused photos anyway.
 * @param {string[]} paths
 * @returns {Promise<void>}
 */
async function removeUnusedPhotos(paths) {
  if (!paths.length) return;
  await db().storage.from(OFFER_PHOTO_BUCKET).remove(paths).catch(() => null);
}

/**
 * Short-lived addresses (1 hour) for photos the viewer may see; photos they can't see are left out.
 * @param {string[] | null | undefined} paths
 * @returns {Promise<string[]>}
 */
async function photoUrls(paths) {
  if (!paths?.length) return [];
  const { data, error } = await db().storage.from(OFFER_PHOTO_BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return [];
  return data.flatMap((row) => (row.signedUrl ? [row.signedUrl] : []));
}

/**
 * Alpine component for the 1–3 photo picker (the offer form): <div x-data="photoPicker">.
 * The chosen photos are in `photos`; the form reads them through `$refs` / events.
 */
document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("photoPicker", () => ({
    /** @type {PreparedPhoto[]} */
    photos: [],
    error: "",
    busy: false,
    max: MAX_OFFER_PHOTOS,

    /** @param {Event} event */
    async pick(event) {
      const input = /** @type {HTMLInputElement} */ (event.target);
      const files = [...(input.files ?? [])];
      input.value = "";
      this.error = "";
      if (this.photos.length + files.length > MAX_OFFER_PHOTOS) this.error = t("photos.errMax", { count: MAX_OFFER_PHOTOS });
      this.busy = true;
      try {
        for (const file of files.slice(0, MAX_OFFER_PHOTOS - this.photos.length)) this.photos.push(await preparePhoto(file));
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("photos.errRead");
      } finally {
        this.busy = false;
        this.changed();
      }
    },

    /** @param {number} key */
    remove(key) {
      const photo = this.photos.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.preview);
      this.photos = this.photos.filter((p) => p.key !== key);
      this.changed();
    },

    /** Tells the form which photos are chosen (it listens for "photos-changed"). */
    changed() {
      /** @type {any} */ (this).$dispatch("photos-changed", { photos: [...this.photos] });
    },

    /** Forgets every photo (after sending, or when the form closes). */
    clear() {
      for (const photo of this.photos) URL.revokeObjectURL(photo.preview);
      this.photos = [];
      this.error = "";
    },
  }));
});
