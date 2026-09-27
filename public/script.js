document.addEventListener('DOMContentLoaded', () => {
    const treeContainer = document.getElementById('treeContainer');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userProfile = document.getElementById('userProfile');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const actionButtons = document.getElementById('actionButtons');
    
    // Modals
    const eventModal = document.getElementById('eventModal');
    const mediaModal = document.getElementById('mediaModal');
    
    const addEventBtn = document.getElementById('addEventBtn');
    const closeEventModal = document.getElementById('closeEventModal');
    const closeMediaModal = document.getElementById('closeMediaModal');
    
    const addEventForm = document.getElementById('addEventForm');
    const addMediaForm = document.getElementById('addMediaForm');
    
    // Prevent selecting future dates in the calendar
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.max = new Date().toISOString().split("T")[0];
    }

    let isDriveConnected = false;
    let globalEvents = [];

    // Check Auth Status
    async function checkDriveStatus() {
        try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();
            
            if (data.connected && data.user) {
                loginBtn.style.display = 'none';
                userProfile.style.display = 'flex';
                userName.textContent = data.user.name;
                userAvatar.src = data.user.picture;
                actionButtons.style.display = 'flex';
            } else {
                loginBtn.style.display = 'inline-block';
                userProfile.style.display = 'none';
                actionButtons.style.display = 'none';
                yearsView.innerHTML = '<p style="text-align:center; width:100%; margin-top:20px;">Please sign in to view and upload your life journey.</p>';
            }
        } catch(e) {
            console.error("Failed to check auth status");
        }
    }

    loginBtn.onclick = async () => {
        try {
            const res = await fetch('/api/auth/url');
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (e) {
            alert('Failed to get Google login URL');
        }
    };

    logoutBtn.onclick = async () => {
        await fetch('/api/auth/logout');
        window.location.reload();
    };

    const yearsView = document.getElementById('yearsView');
    const tripsView = document.getElementById('tripsView');
    const tripsGrid = document.getElementById('tripsGrid');
    const backToYearsBtn = document.getElementById('backToYearsBtn');
    const currentYearTitle = document.getElementById('currentYearTitle');

    // Fetch and render events
    async function loadEvents() {
        try {
            const response = await fetch('/api/events');
            globalEvents = await response.json();
            
            // Sort events chronologically by default
            globalEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            renderYears(globalEvents);

            // Sync active Trips View
            if (tripsView.style.display === 'block') {
                const yearMatch = currentYearTitle.textContent.match(/^(\d{4})/);
                if (yearMatch) {
                    const yearStr = yearMatch[1];
                    const remainingTrips = globalEvents.filter(e => new Date(e.date).getFullYear().toString() === yearStr);
                    if (remainingTrips.length === 0) {
                        backToYearsBtn.click();
                    } else {
                        showTripsForYear(yearStr, remainingTrips);
                    }
                }
            }

            // Sync active Gallery View
            if (galleryModal.style.display === 'block') {
                const galleryTitleEl = document.getElementById('galleryModalTitle').textContent;
                // find the event whose title is in the gallery modal title
                const event = globalEvents.find(e => galleryTitleEl.includes(e.title));
                if (event) {
                    openGalleryModal(event.id, event.title);
                } else {
                    galleryModal.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error fetching events:', error);
            yearsView.innerHTML = '<p style="text-align:center; width: 100%;">Failed to load events. Is the server running?</p>';
        }
    }

    function renderYears(events) {
        yearsView.innerHTML = '';
        yearsView.className = 'map-wrapper';
        
        // Group by Calendar Year
        const grouped = {};
        events.forEach(ev => {
            const dateObj = new Date(ev.date);
            const calendarYear = dateObj.getFullYear();
            if (!grouped[calendarYear]) grouped[calendarYear] = [];
            grouped[calendarYear].push(ev);
        });

        // Determine year range and only include years that have trips
        const currentYear = new Date().getFullYear();
        let dbYears = Object.keys(grouped).map(Number);
        
        // Sort descending (newest year at the top)
        dbYears.sort((a, b) => b - a);
        
        const yearsArray = dbYears;

        if (yearsArray.length === 0) {
            yearsView.innerHTML = '<p style="text-align:center; width:100%; margin-top:20px;">No trips added yet. Add a new trip to see the map!</p>';
            return;
        }

        const nodeSpacingY = 180; // vertical pixels between nodes
        const containerHeight = yearsArray.length * nodeSpacingY + 100;
        
        const mapContainer = document.createElement('div');
        mapContainer.className = 'map-container';
        mapContainer.style.height = `${containerHeight}px`;

        // SVG Path setup
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'map-path-svg');
        svg.setAttribute('viewBox', `0 0 100 ${containerHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'map-path-line');
        
        const nodesContainer = document.createElement('div');
        nodesContainer.className = 'map-nodes-container';
        
        let pathD = '';

        yearsArray.forEach((year, index) => {
            const tripCount = grouped[year] ? grouped[year].length : 0;
            
            // Calculate Position
            const yPos = 80 + index * nodeSpacingY;
            // X position using a sine wave, oscillating between 20% and 80% width
            const xOffset = Math.sin(index * 1.5) * 30; // 30 is amplitude
            const xPosPercent = 50 + xOffset;
            
            // Draw Path connecting nodes
            if (index === 0) {
                pathD += `M ${xPosPercent} ${yPos} `;
            } else {
                const prevY = 80 + (index - 1) * nodeSpacingY;
                const prevXOffset = Math.sin((index - 1) * 1.5) * 30;
                const prevXPercent = 50 + prevXOffset;
                
                // Control points for a smooth cubic bezier curve
                const cp1X = prevXPercent;
                const cp1Y = prevY + (nodeSpacingY / 2);
                const cp2X = xPosPercent;
                const cp2Y = yPos - (nodeSpacingY / 2);
                
                pathD += `C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${xPosPercent} ${yPos} `;
            }

            // Create HTML Node
            const node = document.createElement('div');
            node.className = `map-node ${year === currentYear ? 'current-year' : 'past-year'}`;
            if (tripCount === 0 && year !== currentYear) {
                node.classList.add('empty-year');
            }
            node.style.top = `${yPos}px`;
            node.style.left = `${xPosPercent}%`;
            
            node.innerHTML = `
                <div class="map-node-label">${year}</div>
                ${tripCount > 0 ? `<div class="map-node-sublabel">${tripCount} Trips</div>` : ''}
            `;
            
            let pressTimer;
            let isLongPress = false;
            
            const startPress = (e) => {
                isLongPress = false;
                pressTimer = window.setTimeout(() => {
                    isLongPress = true;
                    if (confirm(`Are you sure you want to delete ALL trips for the year ${year}? This cannot be undone.`)) {
                        fetch(`/api/events/year/${year}`, { method: 'DELETE' })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) loadEvents();
                                else alert('Error deleting year: ' + data.error);
                            });
                    }
                }, 800);
            };
            
            const cancelPress = () => clearTimeout(pressTimer);
            
            node.onmousedown = startPress;
            node.onmouseup = cancelPress;
            node.onmouseleave = cancelPress;
            node.ontouchstart = startPress;
            node.ontouchend = cancelPress;
            node.ontouchcancel = cancelPress;
            node.ontouchmove = cancelPress;

            node.onclick = (e) => {
                if (isLongPress) {
                    e.preventDefault();
                    return;
                }
                if (tripCount > 0) {
                    showTripsForYear(year, grouped[year]);
                } else {
                    alert(`No trips tracked for ${year} yet.`);
                }
            };
            
            nodesContainer.appendChild(node);
        });

        path.setAttribute('d', pathD);
        svg.appendChild(path);
        
        mapContainer.appendChild(svg);
        mapContainer.appendChild(nodesContainer);
        yearsView.appendChild(mapContainer);
    }

    window.deleteTrip = (tripId, yearStr) => {
        if (confirm("Are you sure you want to permanently delete this trip and all its photos?")) {
            fetch(`/api/events/${tripId}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadEvents(); // Reload all data and let the new loadEvents sync UI
                    } else {
                        alert("Error: " + data.error);
                    }
                });
        }
    };

    function showTripsForYear(year, events) {
        currentYearTitle.textContent = `${year} Trips & Memories`;
        tripsGrid.innerHTML = '';
        
        events.forEach(event => {
            const dateObj = new Date(event.date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }); // Omit year since it's implied
            
            const card = document.createElement('div');
            card.className = 'trip-card';
            
            // Background
            let bgStyle = '';
            if (event.media && event.media.length > 0) {
                const firstImage = event.media.find(m => m.type === 'image');
                if (firstImage) {
                    bgStyle = `background-image: url('${firstImage.url}');`;
                } else {
                    bgStyle = `background: linear-gradient(45deg, rgba(255,107,107,0.5), rgba(78,205,196,0.5));`;
                }
            }

            card.innerHTML = `
                <button class="delete-trip-btn" onclick="deleteTrip(${event.id}, '${year}')" title="Delete Trip"><i class="fas fa-trash"></i></button>
                <div class="card-bg" style="${bgStyle}"></div>
                <div class="card-content" style="flex: 1; display: flex; flex-direction: column;">
                    <div class="card-date">${formattedDate}</div>
                    <h3 class="card-title">${event.title}</h3>
                    <p class="card-desc" style="flex: 1;">${event.description || ''}</p>
                    <div class="card-actions">
                        <button class="action-btn view-media-btn" data-id="${event.id}" data-title="${event.title}">
                            <i class="fas fa-images"></i> View Images (${event.media ? event.media.length : 0})
                        </button>
                        <button class="action-btn add-media-btn" data-id="${event.id}" data-title="${event.title}">
                            <i class="fas fa-upload"></i> Upload
                        </button>
                    </div>
                </div>
            `;
            tripsGrid.appendChild(card);
        });

        // Attach event listeners to new buttons
        document.querySelectorAll('.add-media-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!isDriveConnected) {
                    alert("Please click 'Connect Google Drive' at the top first!");
                    return;
                }
                const eventId = e.currentTarget.getAttribute('data-id');
                const eventTitle = e.currentTarget.getAttribute('data-title');
                openMediaModal(eventId, eventTitle);
            });
        });

        document.querySelectorAll('.view-media-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const eventId = e.currentTarget.getAttribute('data-id');
                const eventTitle = e.currentTarget.getAttribute('data-title');
                openGalleryModal(eventId, eventTitle);
            });
        });

        // Switch views
        yearsView.style.display = 'none';
        tripsView.style.display = 'block';
    }

    backToYearsBtn.onclick = () => {
        tripsView.style.display = 'none';
        yearsView.style.display = 'block';
    };

    // Modal References
    const galleryModal = document.getElementById('galleryModal');
    const closeGalleryModal = document.getElementById('closeGalleryModal');
    const sliderModal = document.getElementById('sliderModal');
    const closeSliderModal = document.getElementById('closeSliderModal');
    const sliderContainer = document.getElementById('sliderContainer');
    
    // Gallery Modal Logic
    closeGalleryModal.onclick = () => galleryModal.style.display = "none";
    closeSliderModal.onclick = () => sliderModal.style.display = "none";
    
    function openGalleryModal(id, title) {
        const event = globalEvents.find(e => e.id == id);
        document.getElementById('galleryModalTitle').innerHTML = `<i class="fas fa-images"></i> ${title} Gallery`;
        
        const container = document.getElementById('galleryGridContainer');
        container.innerHTML = '';
        
        if (event && event.media && event.media.length > 0) {
            event.media.forEach((m, index) => {
                const elem = document.createElement(m.type === 'video' ? 'video' : 'img');
                elem.src = m.url;
                elem.className = 'gallery-thumbnail';
                if(m.type === 'video') elem.preload = 'metadata';
                
                elem.onclick = () => openSlider(event.media, index);
                
                // Hide if error
                elem.onerror = () => elem.style.display = 'none';
                
                container.appendChild(elem);
            });
        } else {
            container.innerHTML = '<p style="text-align:center; width:100%;">No media uploaded yet.</p>';
        }
        
        galleryModal.style.display = "block";
    }

    let currentSliderMediaList = [];

    function openSlider(mediaArray, startIndex) {
        currentSliderMediaList = mediaArray;
        sliderContainer.innerHTML = '';
        mediaArray.forEach((m, index) => {
            const item = document.createElement('div');
            item.className = 'slider-item';
            if (m.type === 'video') {
                item.innerHTML = `<video src="${m.url}" controls></video>`;
            } else {
                item.innerHTML = `<img src="${m.url}">`;
            }
            sliderContainer.appendChild(item);
        });
        
        sliderModal.style.display = 'block';
        
        // Scroll to the tapped image immediately
        requestAnimationFrame(() => {
            const itemWidth = sliderContainer.clientWidth;
            sliderContainer.scrollTo({ left: startIndex * itemWidth, behavior: 'instant' });
        });
    }

    // Delete single photo from slider
    document.getElementById('deletePhotoBtn').onclick = () => {
        if (currentSliderMediaList.length === 0) return;
        
        // Calculate which image is currently in view
        const itemWidth = sliderContainer.clientWidth;
        const scrollLeft = sliderContainer.scrollLeft;
        const currentIndex = Math.round(scrollLeft / itemWidth);
        
        const mediaToDelete = currentSliderMediaList[currentIndex];
        if (!mediaToDelete) return;

        if (confirm("Are you sure you want to permanently delete this photo?")) {
            fetch(`/api/media/${mediaToDelete.id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        sliderModal.style.display = 'none';
                        loadEvents(); // Reloads all data and UI
                    } else {
                        alert("Error: " + data.error);
                    }
                });
        }
    };

    // Modal Display Logic
    addEventBtn.onclick = () => eventModal.style.display = "block";
    closeEventModal.onclick = () => eventModal.style.display = "none";
    closeMediaModal.onclick = () => mediaModal.style.display = "none";
    
    window.onclick = (e) => {
        if (e.target == eventModal) eventModal.style.display = "none";
        if (e.target == mediaModal) mediaModal.style.display = "none";
        if (e.target == galleryModal) galleryModal.style.display = "none";
    }

    function openMediaModal(id, title) {
        document.getElementById('mediaEventId').value = id;
        document.getElementById('mediaModalEventTitle').textContent = `To: ${title}`;
        mediaModal.style.display = "block";
    }

    // New Event Form Submit
    addEventForm.onsubmit = async (e) => {
        e.preventDefault();
        
        // Convert to JSON (no file upload here)
        const formData = new FormData(addEventForm);
        const data = Object.fromEntries(formData.entries());
        
        const submitBtn = addEventForm.querySelector('.submit-btn');
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                eventModal.style.display = "none";
                addEventForm.reset();
                loadEvents(); // Reload tree
            } else {
                alert('Error saving memory.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred.');
        } finally {
            submitBtn.textContent = 'Save Memory';
            submitBtn.disabled = false;
        }
    };

    // Add Media Form Submit
    addMediaForm.onsubmit = async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('mediaEventId').value;
        const formData = new FormData(addMediaForm);
        
        const submitBtn = addMediaForm.querySelector('.submit-btn');
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading to Drive...';
        submitBtn.disabled = true;

        try {
            const response = await fetch(`/api/events/${eventId}/media`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                mediaModal.style.display = "none";
                addMediaForm.reset();
                loadEvents(); // Reload tree to show new media
            } else {
                const err = await response.json();
                alert(err.error || 'Error uploading media.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred.');
        } finally {
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload to Google Drive';
            submitBtn.disabled = false;
        }
    };

    // Initial load
    checkDriveStatus();
});
