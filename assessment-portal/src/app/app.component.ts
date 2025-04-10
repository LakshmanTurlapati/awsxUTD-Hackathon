import { Component, ElementRef, OnInit, OnDestroy, Injectable } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';

declare var VANTA: any;

@Injectable({
  providedIn: 'root'
})
export class VantaService {
  private loadingState = new BehaviorSubject<boolean>(false);
  loadingState$ = this.loadingState.asObservable();
  private appComponent: AppComponent | null = null;
  private loaderStates: { [key: string]: boolean } = {};

  setAppComponent(component: AppComponent) {
    this.appComponent = component;
  }

  setLoaderState(loader: string, isLoading: boolean) {
    this.loaderStates[loader] = isLoading;
    const overallLoading = Object.values(this.loaderStates).some(val => val);
    this.loadingState.next(overallLoading);
    if (this.appComponent) {
      this.appComponent.setIsLoading(overallLoading);
    }
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  activeTab: string = 'assessment';
  isDashboardActive: boolean = false;
  vantaEffect: any = null;
  isLoading: boolean = false;
  maxDistanceInterval: any = null;
  maxDistance: number = 10;
  increasing: boolean = true;

  constructor(
    private router: Router, 
    private el: ElementRef,
    private vantaService: VantaService
  ) {
    // Register this component with the Vanta service
    this.vantaService.setAppComponent(this);
    
    // Track route changes to update active tab
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      if (event.url.includes('/dashboard')) {
        this.activeTab = 'dashboard';
        this.isDashboardActive = true;
        document.body.classList.add('dashboard-active');
        
        if (this.vantaEffect) {
          // Update background color to white and dot color to dark blue for dashboard
          this.vantaEffect.setOptions({
            backgroundColor: 0xFFFFFF,
            color: 0x232F3E
          });
        } else {
          this.initVantaEffect(true);
        }
      } else if (event.url.includes('/assessment')) {
        this.activeTab = 'assessment';
        this.isDashboardActive = false;
        document.body.classList.remove('dashboard-active');
        
        if (this.vantaEffect) {
          // Update background color to dark blue and dot color to orange for assessment
          this.vantaEffect.setOptions({
            backgroundColor: 0x232F3E,
            color: 0xFF9900
          });
        } else {
          this.initVantaEffect(false);
        }
      } else {
        // Default route
        this.activeTab = 'assessment';
        this.isDashboardActive = false;
        document.body.classList.remove('dashboard-active');
        
        if (this.vantaEffect) {
          // Update background color to dark blue and dot color to orange for assessment
          this.vantaEffect.setOptions({
            backgroundColor: 0x232F3E,
            color: 0xFF9900
          });
        } else {
          this.initVantaEffect(false);
        }
      }
    });
    
    // Initially navigate to assessment
    this.router.navigate(['/assessment']);
  }

  ngOnInit() {
    // Initialize Vanta effect if on assessment page
    if (this.activeTab === 'assessment') {
      this.initVantaEffect();
    } else if (this.activeTab === 'dashboard') {
      this.initVantaEffect(true);
    }
    
    // Subscribe to loading state changes
    this.vantaService.loadingState$.subscribe(isLoading => {
      this.isLoading = isLoading;
      if (isLoading) {
        this.startMaxDistanceAnimation();
      } else {
        this.stopMaxDistanceAnimation();
      }
    });
  }

  ngOnDestroy() {
    this.destroyVantaEffect();
    this.stopMaxDistanceAnimation();
  }

  initVantaEffect(isDashboard = false) {
    // Only initialize if we're not already initialized
    if (!this.vantaEffect) {
      // First, create a separate fixed background element that stays in view
      const backgroundEl = document.createElement('div');
      backgroundEl.className = 'vanta-background';
      backgroundEl.style.position = 'fixed';
      backgroundEl.style.top = '0';
      backgroundEl.style.left = '0';
      backgroundEl.style.width = '100%';
      backgroundEl.style.height = '100%';
      backgroundEl.style.zIndex = '-10';
      document.body.appendChild(backgroundEl);
      
      // Set the backgroundColor based on whether we're in dashboard or assessment mode
      const backgroundColor = isDashboard ? 0xFFFFFF : 0x232F3E;
      // Set the dot color based on whether we're in dashboard or assessment mode
      const dotColor = isDashboard ? 0x232F3E : 0xFF9900; // #232F3E (AWS dark blue) for dashboard, orange for assessment
      
      // Initialize Vanta on this background element
      this.vantaEffect = VANTA.NET({
        el: backgroundEl,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        scaleMobile: 1.00,
        color: dotColor, // Dynamic based on page
        backgroundColor: backgroundColor, // Dynamic based on page
        points: 16.00,
        maxDistance: 10.00,
        spacing: 12.00,
        backgroundAlpha: 1
      });
    } else {
      // If already initialized, just update the backgroundColor and color
      const backgroundColor = isDashboard ? 0xFFFFFF : 0x232F3E;
      const dotColor = isDashboard ? 0x232F3E : 0xFF9900;
      this.vantaEffect.setOptions({
        backgroundColor: backgroundColor,
        color: dotColor
      });
    }
  }

  destroyVantaEffect() {
    if (this.vantaEffect) {
      this.vantaEffect.destroy();
      this.vantaEffect = null;
      
      // Remove the background element
      const backgroundEl = document.querySelector('.vanta-background');
      if (backgroundEl) {
        backgroundEl.parentElement?.removeChild(backgroundEl);
      }
    }
  }

  startMaxDistanceAnimation() {
    if (this.vantaEffect && !this.maxDistanceInterval) {
      this.maxDistance = 10;
      this.increasing = true;
      
      // 2 cycles per second means 4 transitions (10->25->10->25->10) per second
      const stepsPerSecond = 14; 
      
      this.maxDistanceInterval = setInterval(() => {
        if (this.increasing) {
          this.maxDistance += 1.875; // (25-10)/8 = 1.875 units per step
          if (this.maxDistance >= 30) {
            this.maxDistance = 30;
            this.increasing = false;
          }
        } else {
          this.maxDistance -= 1.875;
          if (this.maxDistance <= 10) {
            this.maxDistance = 10;
            this.increasing = true;
          }
        }
        // Update the maxDistance in Vanta
        if (this.vantaEffect) {
          this.vantaEffect.setOptions({ maxDistance: this.maxDistance });
        }
      }, 800 / stepsPerSecond); // 8 steps per second
    }
  }

  stopMaxDistanceAnimation() {
    if (this.maxDistanceInterval) {
      clearInterval(this.maxDistanceInterval);
      this.maxDistanceInterval = null;
    }
    
    // Set to final value when stopping
    if (this.vantaEffect) {
      this.vantaEffect.setOptions({ maxDistance: this.isLoading ? 30 : 10 });
    }
  }

  setIsLoading(loading: boolean) {
    this.isLoading = loading;
    
    if (this.isLoading) {
      this.startMaxDistanceAnimation();
    } else {
      this.stopMaxDistanceAnimation();
      
      // Set back to default value
      if (this.vantaEffect) {
        this.vantaEffect.setOptions({ maxDistance: 10 });
      }
    }
  }

  navigateTo(tab: string) {
    this.activeTab = tab;
    this.router.navigate([`/${tab}`]);
  }
}
