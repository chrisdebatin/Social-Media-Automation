import sharp from 'sharp';
const [,, L, out] = process.argv;
const jobs = [
 ['Pflegeunion_Logo_Hauptversion.png','brand/logo-hauptversion.png',1600],
 ['Pflegeunion_Logo_Alternative.png','brand/logo-alternative.png',1600],
 ['Kreislogo_Pflegeunion_Hauptversion.png','brand/kreislogo-hauptversion.png',800],
 ['Kreislogo_Pflegeunion_Alternative.png','brand/kreislogo-alternative.png',800],
 ['Mike.png','people/mike.png',1000],
];
for (const [src,dst,w] of jobs) {
  const img = sharp(`${L}/${src}`).trim({threshold:1});
  const info = await img.resize({width:w, withoutEnlargement:true}).png({compressionLevel:9}).toFile(`${out}/${dst}`);
  console.log(dst, info.width, info.height);
}
