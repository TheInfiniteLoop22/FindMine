import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const SAMPLE_POSTS = [
  // 10 FOUND items
  {
    type: "FOUND" as const,
    title: "Black Leather Wallet with College ID",
    description: "Found a black bi-fold leather wallet near the cafeteria entrance. Contains an ID card for a student named Alex and a blue transit pass.",
    category: "ID & Documents",
    locationText: "Main Campus Cafeteria, North Entrance",
    lat: 37.7749,
    lng: -122.4194,
    privateDetail: "Student ID number ends with 4092 and has a $20 bill inside.",
    photoUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Silver Apple MacBook Air 13-inch",
    description: "Left on a study table in the central library on 2nd floor. Has a cosmic galaxy sticker on the top shell.",
    category: "Electronics",
    locationText: "Central Library, 2nd Floor Quiet Zone",
    lat: 37.7752,
    lng: -122.4180,
    privateDetail: "Lock screen wallpaper is a mountain landscape at sunset.",
    photoUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Set of 3 House Keys with Red Keychain",
    description: "Found on the bench near the outdoor basketball courts. Includes a Honda car key fob and a red rubber keychain.",
    category: "Keys",
    locationText: "Sports Complex Basketball Courts",
    lat: 37.7735,
    lng: -122.4210,
    privateDetail: "Key fob has a small chip on the lock button.",
    photoUrl: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Blue Herschel Backpack with Textbooks",
    description: "Left under table #14 in the student union food court. Contains notebooks and a calculus textbook.",
    category: "Bags & Backpacks",
    locationText: "Student Union Building, 1st Floor",
    lat: 37.7760,
    lng: -122.4175,
    privateDetail: "Name 'Jordan' written in silver marker inside the front zip pocket.",
    photoUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Sony WH-1000XM4 Wireless Headphones",
    description: "Found matte black wireless headphones in case on the shuttle bus route B.",
    category: "Electronics",
    locationText: "Campus Shuttle Bus Stop B",
    lat: 37.7740,
    lng: -122.4225,
    privateDetail: "Headphone band has a slight scratch near the right swivel hinge.",
    photoUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Golden Retriever Puppy with Blue Collar",
    description: "Found friendly young Golden Retriever wandering near the east gate parking lot.",
    category: "Pets",
    locationText: "East Parking Lot Gate",
    lat: 37.7770,
    lng: -122.4160,
    privateDetail: "Collar has a paw-shaped tag with no phone number.",
    photoUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Trek Mountain Bike (Matte Black)",
    description: "Found unlocked bike resting against the rack near the engineering building.",
    category: "Bicycles & Vehicles",
    locationText: "Engineering Hall Bike Rack",
    lat: 37.7725,
    lng: -122.4205,
    privateDetail: "Serial number under bottom bracket starts with TRK882.",
    photoUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Gold Band Ring with Small Diamond",
    description: "Found in the restrooms on 1st floor of science complex.",
    category: "Jewelry & Watches",
    locationText: "Science Building A, 1st Floor Restroom",
    lat: 37.7758,
    lng: -122.4190,
    privateDetail: "Engraved initials 'S & M' on inner band.",
    photoUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Ray-Ban Aviator Sunglasses in Black Case",
    description: "Found on an outdoor bench near the quad fountain.",
    category: "Other",
    locationText: "Central Quad Fountain Benches",
    lat: 37.7745,
    lng: -122.4198,
    privateDetail: "Right lens has a micro scratch in top corner.",
    photoUrl: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&auto=format&fit=crop",
  },
  {
    type: "FOUND" as const,
    title: "Apple Watch Series 8 (Space Gray)",
    description: "Found on treadmill #4 at the campus recreation center.",
    category: "Electronics",
    locationText: "Rec Center Gym, 2nd Floor Fitness Area",
    lat: 37.7730,
    lng: -122.4185,
    privateDetail: "Sport loop band is olive green color.",
    photoUrl: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop",
  },

  // 10 LOST items
  {
    type: "LOST" as const,
    title: "Lost: Brown Leather Satchel Bag",
    description: "Misplaced my vintage brown leather shoulder satchel containing my research notes and iPad.",
    category: "Bags & Backpacks",
    locationText: "Humanities Auditorium Hallway",
    lat: 37.7750,
    lng: -122.4200,
    privateDetail: "iPad case is navy blue with a magnetic flap.",
    photoUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Airpods Pro 2nd Gen in Clear Case",
    description: "Dropped my AirPods while jogging around the campus track field yesterday afternoon.",
    category: "Electronics",
    locationText: "Athletic Track & Field Perimeter",
    lat: 37.7738,
    lng: -122.4215,
    privateDetail: "Clear plastic case has a small yellow Pokemon sticker.",
    photoUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Toyota Car Remote Key & Dorm Key",
    description: "Lost my single car key fob attached to brass dorm room key #304.",
    category: "Keys",
    locationText: "Dormitory Block C Courtyard",
    lat: 37.7765,
    lng: -122.4170,
    privateDetail: "Dorm key has a blue plastic cap.",
    photoUrl: "https://images.unsplash.com/photo-1622675363311-3e1904dc1885?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Passport and Visa Documents Folder",
    description: "Left a clear plastic button folder with international passport and visa copies.",
    category: "ID & Documents",
    locationText: "International Student Services Office",
    lat: 37.7755,
    lng: -122.4182,
    privateDetail: "Folder contains two passport size photos.",
    photoUrl: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Tabby Cat named 'Milo' (Microchipped)",
    description: "Our brown tabby indoor cat Milo slipped out near the faculty apartments.",
    category: "Pets",
    locationText: "Faculty Housing Village Block 2",
    lat: 37.7780,
    lng: -122.4150,
    privateDetail: "Has a tiny notch on his left ear.",
    photoUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Silver Nintendo Switch OLED",
    description: "Left in black hard carrying case on the 3rd floor lounge sofa.",
    category: "Electronics",
    locationText: "Student Center 3rd Floor Lounge",
    lat: 37.7748,
    lng: -122.4188,
    privateDetail: "Case holds Mario Kart 8 and Zelda cartridges inside mesh pouch.",
    photoUrl: "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Specialized Road Bike (Red / White)",
    description: "Stolen or misplaced road bike near the chemistry lab bike stands.",
    category: "Bicycles & Vehicles",
    locationText: "Chemistry Building South Bike Stand",
    lat: 37.7742,
    lng: -122.4208,
    privateDetail: "Red water bottle holder installed on frame.",
    photoUrl: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Silver Chain Necklace with Cross Pendant",
    description: "Sentimental silver chain lost during intramural soccer match.",
    category: "Jewelry & Watches",
    locationText: "East Soccer Field Bench Area",
    lat: 37.7732,
    lng: -122.4220,
    privateDetail: "Clasp is slightly bent and hard to close.",
    photoUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Bose QuietComfort Earbuds (Soapstone)",
    description: "White charging case with Bose earbuds lost in computer lab 101.",
    category: "Electronics",
    locationText: "Tech Hall Computer Lab 101",
    lat: 37.7751,
    lng: -122.4178,
    privateDetail: "Bottom of case has a black marker dot.",
    photoUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop",
  },
  {
    type: "LOST" as const,
    title: "Lost: Black Hydro Flask Water Bottle 32oz",
    description: "Black insulated water bottle with national park stickers.",
    category: "Other",
    locationText: "Fitness Center Weight Room",
    lat: 37.7728,
    lng: -122.4182,
    privateDetail: "Bottom boot is teal blue colored rubber.",
    photoUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop",
  },
];

async function seedAAAccountAndPosts() {
  console.log("Seeding Account AA and sample items...");

  // 1. Create or ensure User Account AA
  const email = "aa@findmine.com";
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    user = await prisma.user.create({
      data: {
        email,
        displayName: "Account AA",
        passwordHash,
      },
    });
    console.log(`Created Account AA: ${user.email} (ID: ${user.id})`);
  } else {
    console.log(`Account AA already exists: ${user.email} (ID: ${user.id})`);
  }

  // 2. Populate 20 posts under Account AA
  let createdCount = 0;
  for (const postData of SAMPLE_POSTS) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- created only for its DB row to exist
    const post = await prisma.post.create({
      data: {
        type: postData.type,
        title: postData.title,
        description: postData.description,
        category: postData.category,
        locationText: postData.locationText,
        lat: postData.lat,
        lng: postData.lng,
        privateDetail: postData.privateDetail,
        photoUrl: postData.photoUrl,
        userId: user.id,
        images: {
          create: [
            {
              url: postData.photoUrl,
              isPrimary: true,
            },
          ],
        },
      },
    });
    createdCount++;
  }

  console.log(`Successfully created ${createdCount} sample posts for Account AA!`);
}

seedAAAccountAndPosts()
  .catch((e) => {
    console.error("Error seeding posts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
