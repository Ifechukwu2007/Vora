import { supabase } from "./supabase.js";

const grid = document.getElementById("wishlistGrid");

loadWishlist();

async function loadWishlist() {

    const { data: session } =
        await supabase.auth.getSession();

    if (!session.session) {

        location.href = "login.html";

        return;

    }

    const user = session.session.user;

    const { data, error } = await supabase

        .from("wishlists")

        .select(`
            id,
            services(
                id,
                title,
                description,
                price,
                image_url,
                location,
                category
            )
        `)

        .eq("user_id", user.id);

    if (error) {

        console.error(error);

        grid.innerHTML = `
            <p class="text-red-600">
                Failed to load wishlist.
            </p>
        `;

        return;

    }

    render(data);

}

function render(items) {

    if (!items.length) {

        grid.innerHTML = `

        <div class="col-span-full text-center">

            <h2 class="text-2xl font-bold">

                Your wishlist is empty

            </h2>

            <a
            href="browse.html"
            class="inline-block mt-5 bg-blue-600 text-white px-6 py-3 rounded-lg">

            Browse Services

            </a>

        </div>

        `;

        return;

    }

    grid.innerHTML = "";

    items.forEach(item=>{

        const service = item.services;

        const card=document.createElement("div");

        card.className="bg-white rounded-xl shadow hover:shadow-lg overflow-hidden";

        card.innerHTML=`

        <img
        src="${service.image_url || 'https://placehold.co/600x400'}"
        class="w-full h-56 object-cover">

        <div class="p-5">

            <h2 class="text-xl font-bold">

                ${service.title}

            </h2>

            <p class="text-gray-500 mt-2">

                ${service.category}

            </p>

            <p class="text-gray-500">

                📍 ${service.location}

            </p>

            <p class="text-blue-600 font-bold text-2xl mt-3">

                ₦${Number(service.price).toLocaleString()}

            </p>

            <div class="flex gap-3 mt-5">

                <a

                href="service.html?id=${service.id}"

                class="flex-1 text-center bg-blue-600 text-white py-3 rounded-lg">

                View

                </a>

                <button

                data-id="${service.id}"

                class="removeBtn flex-1 bg-red-600 text-white rounded-lg">

                Remove

                </button>

            </div>

        </div>

        `;

        grid.appendChild(card);

    });

    document.querySelectorAll(".removeBtn").forEach(btn=>{

        btn.onclick=()=>removeWishlist(btn.dataset.id);

    });

}

async function removeWishlist(serviceId){

    const { data: session } =
        await supabase.auth.getSession();

    const user=session.session.user;

    await supabase

        .from("wishlists")

        .delete()

        .eq("user_id",user.id)

        .eq("service_id",serviceId);

    loadWishlist();

}